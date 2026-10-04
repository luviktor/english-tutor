using EnglishTutor.Api.Auth;

namespace EnglishTutor.Api.Dictionary;

/// <summary>
/// The teachers' changes to the dictionary (docs/teacher-dictionary.md). Every change is checked against the
/// rules, records the teacher who made it, and must name the revision it is based on: if someone else changed the
/// same entry or topic in the meantime, the change is refused and the current version is returned instead.
/// A successful change clears the cache, so it shows at once.
/// </summary>
public sealed class DictionaryService(IDictionaryStore store, DictionaryProvider provider, Roster roster, TimeProvider time)
{
    private const int IdAttempts = 3;

    // --- entries ------------------------------------------------------------------------------------------------

    public async Task<DictionaryChange<DictionaryWord>> AddEntryAsync(string teacherId, EntryInput input, CancellationToken cancellationToken)
    {
        var (clean, error) = DictionaryRules.ValidateEntry(input);
        if (clean is null) return Invalid(error!);

        var content = await store.ReadAllAsync(cancellationToken);
        if (content.Entries.Count >= DictionaryRules.MaxEntries)
        {
            return new Problem(ChangeStatus.Invalid, $"Legfeljebb {DictionaryRules.MaxEntries} bejegyzés lehet.", "entries");
        }
        if (CheckEntry(content, clean, ignoreId: null) is { } problem) return problem;

        for (var attempt = 0; attempt < IdAttempts; attempt++)
        {
            var entry = new EntryDocument(DictionaryIds.NewEntry(), 1, clean.Kind, clean.TopicId, clean.English, clean.AlsoAccepted,
                clean.Hu, clean.Note, clean.Visual, teacherId, time.GetUtcNow());
            if (await store.TryCreateAsync(entry, cancellationToken))
            {
                provider.Invalidate();
                return DictionaryWord.From(entry, TopicName(content, entry.TopicId), roster.TeacherName);
            }
        }
        throw new InvalidOperationException("No free entry id after several tries.");
    }

    public async Task<DictionaryChange<DictionaryWord>> UpdateEntryAsync(string teacherId, string id, EntryInput input, CancellationToken cancellationToken)
    {
        var (clean, error) = DictionaryRules.ValidateEntry(input);
        if (clean is null) return Invalid(error!);
        if (input.Revision is not { } revision) return MissingRevision();

        var stored = await store.GetAsync<EntryDocument>(id, cancellationToken);
        if (stored is null) return EntryGone();
        if (stored.Document.Revision != revision) return await StaleEntryAsync(stored.Document, cancellationToken);

        var content = await store.ReadAllAsync(cancellationToken);
        if (CheckEntry(content, clean, ignoreId: id) is { } problem) return problem;

        var next = stored.Document with
        {
            Revision = revision + 1,
            Kind = clean.Kind,
            TopicId = clean.TopicId,
            English = clean.English,
            AlsoAccepted = clean.AlsoAccepted,
            Hu = clean.Hu,
            Note = clean.Note,
            Visual = clean.Visual,
            UpdatedBy = teacherId,
            UpdatedAt = time.GetUtcNow(),
        };
        if (!await store.TryReplaceAsync(next, stored.ETag, cancellationToken)) return await StaleEntryAsync(id, cancellationToken);
        provider.Invalidate();
        return DictionaryWord.From(next, TopicName(content, next.TopicId), roster.TeacherName);
    }

    public async Task<DictionaryChange<bool>> DeleteEntryAsync(string id, int revision, CancellationToken cancellationToken)
    {
        var stored = await store.GetAsync<EntryDocument>(id, cancellationToken);
        if (stored is null) return EntryGone();
        if (stored.Document.Revision != revision) return await StaleEntryAsync(stored.Document, cancellationToken);
        if (!await store.TryDeleteAsync(id, stored.ETag, cancellationToken)) return await StaleEntryAsync(id, cancellationToken);
        provider.Invalidate();
        return true;
    }

    // --- topics -------------------------------------------------------------------------------------------------

    public async Task<DictionaryChange<DictionaryTopic>> AddTopicAsync(string teacherId, TopicInput input, CancellationToken cancellationToken)
    {
        var (clean, error) = DictionaryRules.ValidateTopic(input);
        if (clean is null) return Invalid(error!);

        var content = await store.ReadAllAsync(cancellationToken);
        if (content.Topics.Count >= DictionaryRules.MaxTopics)
        {
            return new Problem(ChangeStatus.Invalid, $"Legfeljebb {DictionaryRules.MaxTopics} téma lehet.", "topics");
        }
        if (CheckTopicName(content, clean.Name, ignoreId: null) is { } problem) return problem;

        var order = content.Topics.Select(t => t.Order).DefaultIfEmpty(0).Max() + 1;
        for (var attempt = 0; attempt < IdAttempts; attempt++)
        {
            var topic = new TopicDocument(DictionaryIds.NewTopic(), 1, clean.Name, clean.Emoji, clean.Color, order, teacherId, time.GetUtcNow());
            if (await store.TryCreateAsync(topic, cancellationToken))
            {
                provider.Invalidate();
                return DictionaryTopic.From(topic, roster.TeacherName);
            }
        }
        throw new InvalidOperationException("No free topic id after several tries.");
    }

    public async Task<DictionaryChange<DictionaryTopic>> UpdateTopicAsync(string teacherId, string id, TopicInput input, CancellationToken cancellationToken)
    {
        var (clean, error) = DictionaryRules.ValidateTopic(input);
        if (clean is null) return Invalid(error!);
        if (input.Revision is not { } revision) return MissingRevision();

        var stored = await store.GetAsync<TopicDocument>(id, cancellationToken);
        if (stored is null) return TopicGone();
        if (stored.Document.Revision != revision) return StaleTopic(stored.Document);

        var content = await store.ReadAllAsync(cancellationToken);
        if (CheckTopicName(content, clean.Name, ignoreId: id) is { } problem) return problem;

        var next = stored.Document with
        {
            Revision = revision + 1,
            Name = clean.Name,
            Emoji = clean.Emoji,
            Color = clean.Color,
            UpdatedBy = teacherId,
            UpdatedAt = time.GetUtcNow(),
        };
        if (!await store.TryReplaceAsync(next, stored.ETag, cancellationToken)) return await StaleTopicAsync(id, cancellationToken);
        provider.Invalidate();
        return DictionaryTopic.From(next, roster.TeacherName);
    }

    public async Task<DictionaryChange<bool>> DeleteTopicAsync(string id, int revision, CancellationToken cancellationToken)
    {
        var stored = await store.GetAsync<TopicDocument>(id, cancellationToken);
        if (stored is null) return TopicGone();
        if (stored.Document.Revision != revision) return StaleTopic(stored.Document);

        // Not atomic: an entry added to the topic at this very moment is left without a topic, and the dictionary
        // names it in a warning.
        var content = await store.ReadAllAsync(cancellationToken);
        if (content.Entries.Any(e => e.TopicId == id))
        {
            return new Problem(ChangeStatus.TopicNotEmpty, "A téma még nem üres: előbb töröld a bejegyzéseit, vagy tedd át őket másik témába.");
        }
        if (!await store.TryDeleteAsync(id, stored.ETag, cancellationToken)) return await StaleTopicAsync(id, cancellationToken);
        provider.Invalidate();
        return true;
    }

    /// <summary>Puts the topics in the order of <paramref name="ids"/>, which must list every topic once.</summary>
    public async Task<DictionaryChange<IReadOnlyList<DictionaryTopic>>> SetTopicOrderAsync(string teacherId, IReadOnlyList<string>? ids, CancellationToken cancellationToken)
    {
        ids ??= [];
        if (ids.Distinct().Count() != ids.Count) return new Problem(ChangeStatus.Invalid, "Egy téma csak egyszer szerepelhet a sorrendben.", "ids");

        var content = await store.ReadAllAsync(cancellationToken);
        if (!content.Topics.Select(t => t.Id).ToHashSet().SetEquals(ids))
        {
            return new Problem(ChangeStatus.Stale, "A témák listája közben megváltozott. Frissítsd az oldalt!");
        }

        var now = time.GetUtcNow();
        var current = new List<TopicDocument>();
        var replacements = new List<(DictionaryDocument Document, string ETag)>();
        for (var i = 0; i < ids.Count; i++)
        {
            var stored = await store.GetAsync<TopicDocument>(ids[i], cancellationToken);
            if (stored is null) return new Problem(ChangeStatus.Stale, "A témák listája közben megváltozott. Frissítsd az oldalt!");
            var topic = stored.Document;
            if (topic.Order != i + 1)
            {
                topic = topic with { Order = i + 1, Revision = topic.Revision + 1, UpdatedBy = teacherId, UpdatedAt = now };
                replacements.Add((topic, stored.ETag));
            }
            current.Add(topic);
        }

        if (replacements.Count > 0)
        {
            if (!await store.TryReplaceAllAsync(replacements, cancellationToken))
            {
                return new Problem(ChangeStatus.Stale, "A témákat közben valaki módosította. Frissítsd az oldalt!");
            }
            provider.Invalidate();
        }
        return current.Select(t => DictionaryTopic.From(t, roster.TeacherName)).ToList();
    }

    // --- checks and helpers -------------------------------------------------------------------------------------

    private static Problem Invalid(ValidationError error) => new(ChangeStatus.Invalid, error.Message, error.Field);

    private static Problem MissingRevision() => new(ChangeStatus.Invalid, "Hiányzik a változat száma, amelyre a módosítás épül.", "revision");

    private static Problem EntryGone() => new(ChangeStatus.NotFound, "Ez a bejegyzés már nem létezik: közben törölték.");

    private static Problem TopicGone() => new(ChangeStatus.NotFound, "Ez a téma már nem létezik: közben törölték.");

    private static string TopicName(DictionaryContent content, string topicId) =>
        content.Topics.FirstOrDefault(t => t.Id == topicId)?.Name ?? "";

    /// <summary>The topic must exist, and no other entry may have one of the spellings (compared by letters only).</summary>
    private Problem? CheckEntry(DictionaryContent content, CleanEntry clean, string? ignoreId)
    {
        if (content.Topics.All(t => t.Id != clean.TopicId))
        {
            return new Problem(ChangeStatus.Invalid, "A téma nem létezik.", "topicId");
        }
        var keys = Spelling.Keys(clean.English, clean.AlsoAccepted);
        var clash = content.Entries.FirstOrDefault(e => e.Id != ignoreId && Spelling.Keys(e.English, e.AlsoAccepted).Overlaps(keys));
        if (clash is null) return null;

        var topicName = TopicName(content, clash.TopicId);
        var where = topicName.Length > 0 ? $" a(z) '{topicName}' témában" : "";
        return new Problem(
            ChangeStatus.Duplicate,
            $"A(z) '{clash.English}' már szerepel{where}, és a gépelős játékban nem lehetne megkülönböztetni tőle.",
            "english",
            DictionaryWord.From(clash, topicName, roster.TeacherName));
    }

    private static Problem? CheckTopicName(DictionaryContent content, string name, string? ignoreId) =>
        content.Topics.Any(t => t.Id != ignoreId && string.Equals(t.Name, name, StringComparison.OrdinalIgnoreCase))
            ? new Problem(ChangeStatus.Invalid, "Ilyen nevű téma már van.", "name")
            : null;

    private async Task<Problem> StaleEntryAsync(string id, CancellationToken cancellationToken) =>
        await store.GetAsync<EntryDocument>(id, cancellationToken) is { } now ? await StaleEntryAsync(now.Document, cancellationToken) : EntryGone();

    private async Task<Problem> StaleEntryAsync(EntryDocument current, CancellationToken cancellationToken)
    {
        var topic = await store.GetAsync<TopicDocument>(current.TopicId, cancellationToken);
        var word = DictionaryWord.From(current, topic?.Document.Name ?? "", roster.TeacherName);
        return new Problem(ChangeStatus.Stale, $"Közben {word.UpdatedBy} módosította.", Current: word);
    }

    private async Task<Problem> StaleTopicAsync(string id, CancellationToken cancellationToken) =>
        await store.GetAsync<TopicDocument>(id, cancellationToken) is { } now ? StaleTopic(now.Document) : TopicGone();

    private Problem StaleTopic(TopicDocument current)
    {
        var topic = DictionaryTopic.From(current, roster.TeacherName);
        return new Problem(ChangeStatus.Stale, $"Közben {topic.UpdatedBy} módosította.", Current: topic);
    }
}
