namespace EnglishTutor.Api.Dictionary;

/// <param name="Key">The entry's id; pupils' progress is keyed by it, so correcting a spelling keeps the progress.</param>
/// <param name="Topic">The topic's name; the games group words by it.</param>
/// <param name="Alts">Every accepted English spelling, the shown one first.</param>
/// <param name="UpdatedBy">The name of the teacher who made the last change.</param>
public sealed record DictionaryWord(
    string Key,
    string TopicId,
    string Topic,
    EntryKind Kind,
    string English,
    IReadOnlyList<string> Alts,
    string Hu,
    string Note,
    string Visual,
    int Revision,
    string UpdatedBy,
    DateTimeOffset UpdatedAt);

public sealed record DictionaryTopic(string Id, string Name, string Emoji, string Color, int Revision, string UpdatedBy, DateTimeOffset UpdatedAt);

/// <summary>
/// The dictionary in the JSON shape the frontend expects (GET /api/dictionary), built from the teachers' documents.
/// </summary>
/// <param name="Topics">In the teachers' order, including topics without entries (the pupils' screens skip those).</param>
/// <param name="Words">By topic, then alphabetically.</param>
/// <param name="Warnings">Hints for the teachers, in Hungarian.</param>
public sealed record DictionaryResponse(IReadOnlyList<DictionaryTopic> Topics, IReadOnlyList<DictionaryWord> Words, IReadOnlyList<string> Warnings)
{
    /// <summary>Fewer entries than this leave too few wrong answers for the multiple-choice and pair games.</summary>
    public const int MinimumTopicEntries = 4;

    private const int WarningExamples = 5;

    /// <param name="teacherName">Turns the id in <c>UpdatedBy</c> into a name.</param>
    public static DictionaryResponse Build(DictionaryContent content, Func<string, string> teacherName)
    {
        var warnings = new List<string>();
        var topics = content.Topics.OrderBy(t => t.Order).ThenBy(t => t.Id, StringComparer.Ordinal).ToList();
        var topicPosition = topics.Select((t, i) => (t.Id, Position: i)).ToDictionary(t => t.Id, t => t.Position);

        var entries = new List<EntryDocument>();
        foreach (var entry in content.Entries)
        {
            if (topicPosition.ContainsKey(entry.TopicId))
            {
                entries.Add(entry);
            }
            else
            {
                warnings.Add($"A(z) '{entry.English}' bejegyzés témája nem létezik - kihagyva.");
            }
        }
        entries = entries
            .OrderBy(e => topicPosition[e.TopicId])
            .ThenBy(e => e.English, StringComparer.OrdinalIgnoreCase)
            .ThenBy(e => e.Id, StringComparer.Ordinal)
            .ToList();

        warnings.AddRange(DuplicateWarnings(entries));
        var counts = entries.GroupBy(e => e.TopicId).ToDictionary(g => g.Key, g => g.Count());
        foreach (var topic in topics)
        {
            var count = counts.GetValueOrDefault(topic.Id);
            if (count == 0)
            {
                warnings.Add($"A(z) '{topic.Name}' téma üres.");
            }
            else if (count < MinimumTopicEntries)
            {
                warnings.Add($"A(z) '{topic.Name}' témában csak {count} bejegyzés van; legalább {MinimumTopicEntries} kell a feleletválasztós és a párosító játékokhoz.");
            }
        }
        var withoutPicture = entries.Where(e => e.Visual.Length == 0).ToList();
        if (withoutPicture.Count > 0)
        {
            var examples = string.Join(", ", withoutPicture.Take(WarningExamples).Select(e => e.English));
            warnings.Add($"{withoutPicture.Count} bejegyzéshez nincs kép (pl. {examples}) - ezeket szöveges feladatokban gyakorolják.");
        }

        var topicNames = topics.ToDictionary(t => t.Id, t => t.Name);
        return new DictionaryResponse(
            topics.Select(t => new DictionaryTopic(t.Id, t.Name, t.Emoji, t.Color, t.Revision, teacherName(t.UpdatedBy), t.UpdatedAt)).ToList(),
            entries.Select(e => new DictionaryWord(
                e.Id, e.TopicId, topicNames[e.TopicId], e.Kind, e.English, [e.English, .. e.AlsoAccepted], e.Hu, e.Note, e.Visual,
                e.Revision, teacherName(e.UpdatedBy), e.UpdatedAt)).ToList(),
            warnings);
    }

    /// <summary>
    /// One warning for every set of entries that share a spelling, compared by letters only like the typing game
    /// does. The check on saving can't be atomic, so two teachers adding the same word at once end up here.
    /// </summary>
    private static IEnumerable<string> DuplicateWarnings(IReadOnlyList<EntryDocument> entries) =>
        entries
            .SelectMany(e => e.AlsoAccepted.Prepend(e.English).Select(Spelling.LettersOnly).Where(s => s.Length > 0).Distinct().Select(s => (Spelling: s, Entry: e)))
            .GroupBy(x => x.Spelling, x => x.Entry)
            .Where(g => g.Count() > 1)
            .Select(g => g.ToList())
            // Entries that share several spellings are still one problem.
            .DistinctBy(group => string.Join('|', group.Select(e => e.Id)))
            .Select(group => $"Lehetséges ismétlődés: {string.Join(", ", group.Select(e => $"'{e.English}'"))} - a gépelős játékban ugyanazt a választ fogadja el mindegyik.");
}
