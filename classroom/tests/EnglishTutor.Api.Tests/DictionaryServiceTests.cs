using System.Text.Json;
using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Dictionary;
using Microsoft.Extensions.Logging.Abstractions;

namespace EnglishTutor.Api.Tests;

public class DictionaryServiceTests
{
    private static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-10-04T08:00:00Z");
    private static readonly CancellationToken Ct = CancellationToken.None;

    private readonly InMemoryDictionaryStore _store = new();
    private readonly ManualTime _time = new(Start);
    private readonly DictionaryProvider _provider;
    private readonly DictionaryService _service;

    public DictionaryServiceTests()
    {
        var roster = Roster.Parse("[]", """
            [
              {"id": "t01", "name": "Éva néni", "password": "hosszu-tanari-jelszo-1"},
              {"id": "t02", "name": "Béla bácsi", "password": "masik-tanari-jelszo-2"}
            ]
            """);
        _provider = new DictionaryProvider(_store, roster, _time, NullLogger<DictionaryProvider>.Instance);
        _service = new DictionaryService(_store, _provider, roster, _time);
    }

    private static TopicInput Topic(string name = "Köszönések", string emoji = "👋", string color = "#74c0fc", int? revision = null) =>
        new(name, emoji, color, revision);

    private static EntryInput Entry(string topicId, string english = "hello", string hu = "szia", string[]? also = null, int? revision = null) =>
        new("word", topicId, english, also, hu, "", "👋", revision);

    private async Task<DictionaryTopic> AddTopic(string name = "Köszönések", string teacher = "t01")
    {
        var change = await _service.AddTopicAsync(teacher, Topic(name), Ct);
        return Assert.IsType<DictionaryTopic>(change.Value);
    }

    private async Task<DictionaryWord> AddEntry(string topicId, string english = "hello", string teacher = "t01", string[]? also = null)
    {
        var change = await _service.AddEntryAsync(teacher, Entry(topicId, english, also: also), Ct);
        return Assert.IsType<DictionaryWord>(change.Value);
    }

    private static void AssertProblem<T>(DictionaryChange<T> change, ChangeStatus status, string? field = null)
    {
        Assert.False(change.Done);
        Assert.Equal(status, change.Problem!.Status);
        if (field is not null) Assert.Equal(field, change.Problem.Field);
        Assert.NotEmpty(change.Problem.Error);
    }

    private async Task<string[]> PublishedWords() =>
        JsonDocument.Parse((await _provider.GetAsync(Ct))!.Json).RootElement.GetProperty("words").EnumerateArray()
            .Select(w => w.GetProperty("english").GetString()!).ToArray();

    // --- entries ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task AddsAnEntryWithAGeneratedIdAndTheTeachersName()
    {
        var topic = await AddTopic();

        var word = await AddEntry(topic.Id, "Thank you", teacher: "t02", also: ["thanks"]);

        Assert.Matches("^e-[a-z0-9]{10}$", word.Key);
        Assert.Equal((1, "Béla bácsi", Start, "Köszönések"), (word.Revision, word.UpdatedBy, word.UpdatedAt, word.Topic));
        Assert.Equal(["Thank you", "thanks"], word.Alts);
        Assert.Equal(["Thank you"], await PublishedWords()); // the cache was cleared
    }

    [Fact]
    public async Task RefusesAnEntryWithABrokenValueAndSaysWhichOne()
    {
        var topic = await AddTopic();

        AssertProblem(await _service.AddEntryAsync("t01", Entry(topic.Id, english: ""), Ct), ChangeStatus.Invalid, "english");
        AssertProblem(await _service.AddEntryAsync("t01", Entry("t-nonexistent"), Ct), ChangeStatus.Invalid, "topicId");
    }

    [Theory]
    [InlineData("Hello")]
    [InlineData("  hello! ")]
    [InlineData("hell-o")]
    public async Task RefusesAnEntryWhoseSpellingIsAlreadyTakenAndNamesTheExistingOne(string english)
    {
        var topic = await AddTopic();
        var existing = await AddEntry(topic.Id, "hello");

        var change = await _service.AddEntryAsync("t02", Entry(topic.Id, english), Ct);

        AssertProblem(change, ChangeStatus.Duplicate, "english");
        Assert.Equal(existing.Key, Assert.IsType<DictionaryWord>(change.Problem!.Current).Key);
        Assert.Contains("'hello'", change.Problem.Error);
    }

    [Fact]
    public async Task RefusesAnEntryWhoseOtherSpellingIsAlreadyTaken()
    {
        var topic = await AddTopic();
        await AddEntry(topic.Id, "Thank you", also: ["thanks"]);

        AssertProblem(await _service.AddEntryAsync("t01", Entry(topic.Id, "Cheers", also: ["Thanks!"]), Ct), ChangeStatus.Duplicate);
    }

    [Fact]
    public async Task StopsAt1000Entries()
    {
        var topic = await AddTopic();
        for (var i = 0; i < DictionaryRules.MaxEntries; i++)
        {
            _store.Put(new EntryDocument($"e-{i}", 1, EntryKind.Word, topic.Id, $"word {i}", [], "szó", "", "", "t01", Start));
        }

        AssertProblem(await _service.AddEntryAsync("t01", Entry(topic.Id, "one more"), Ct), ChangeStatus.Invalid, "entries");
    }

    [Fact]
    public async Task ChangesAnEntryAndKeepsItsId()
    {
        var topic = await AddTopic();
        var other = await AddTopic("Színek");
        var word = await AddEntry(topic.Id, "helo");
        _time.Advance(TimeSpan.FromMinutes(5));

        var change = await _service.UpdateEntryAsync("t02", word.Key, Entry(other.Id, "hello", "szia!", revision: 1), Ct);

        var updated = Assert.IsType<DictionaryWord>(change.Value);
        Assert.Equal((word.Key, 2, "hello", "szia!", "Színek", "Béla bácsi"), (updated.Key, updated.Revision, updated.English, updated.Hu, updated.Topic, updated.UpdatedBy));
        Assert.Equal(Start.AddMinutes(5), updated.UpdatedAt);
        Assert.Equal(["hello"], await PublishedWords());
    }

    [Fact]
    public async Task AnEntryMayKeepItsOwnSpellingsWhenChanged()
    {
        var topic = await AddTopic();
        var word = await AddEntry(topic.Id, "Thank you", also: ["thanks"]);

        var change = await _service.UpdateEntryAsync("t01", word.Key, Entry(topic.Id, "THANK YOU", also: ["thanks"], revision: 1), Ct);

        Assert.True(change.Done);
    }

    [Fact]
    public async Task RefusesToChangeAnEntryIntoAnotherOnesSpelling()
    {
        var topic = await AddTopic();
        await AddEntry(topic.Id, "hello");
        var goodbye = await AddEntry(topic.Id, "goodbye");

        AssertProblem(await _service.UpdateEntryAsync("t01", goodbye.Key, Entry(topic.Id, "Hello", revision: 1), Ct), ChangeStatus.Duplicate);
    }

    [Fact]
    public async Task ASaveBasedOnAnOldRevisionGetsTheCurrentEntryAndTheOtherTeachersName()
    {
        var topic = await AddTopic();
        var word = await AddEntry(topic.Id, "hello", teacher: "t01");
        await _service.UpdateEntryAsync("t02", word.Key, Entry(topic.Id, "hello", "szervusz", revision: 1), Ct);

        var stale = await _service.UpdateEntryAsync("t01", word.Key, Entry(topic.Id, "hello", "helló", revision: 1), Ct);

        AssertProblem(stale, ChangeStatus.Stale);
        var current = Assert.IsType<DictionaryWord>(stale.Problem!.Current);
        Assert.Equal((2, "szervusz", "Béla bácsi"), (current.Revision, current.Hu, current.UpdatedBy));
        Assert.Equal("Közben Béla bácsi módosította.", stale.Problem.Error);
    }

    [Fact]
    public async Task AWriteBetweenTheReadAndTheReplaceIsAConflictToo()
    {
        var topic = await AddTopic();
        var word = await AddEntry(topic.Id, "hello");
        _store.BeforeReplace = () => _store.Put(((EntryDocument)_store.GetAsync<EntryDocument>(word.Key, Ct).Result!.Document) with { Revision = 2, Hu = "másik", UpdatedBy = "t02" });

        var change = await _service.UpdateEntryAsync("t01", word.Key, Entry(topic.Id, "hello", "helló", revision: 1), Ct);

        AssertProblem(change, ChangeStatus.Stale);
        Assert.Equal("másik", Assert.IsType<DictionaryWord>(change.Problem!.Current).Hu);
    }

    [Fact]
    public async Task ChangingOrDeletingAnEntryThatIsGoneIsNotFound()
    {
        var topic = await AddTopic();

        AssertProblem(await _service.UpdateEntryAsync("t01", "e-gone", Entry(topic.Id, revision: 1), Ct), ChangeStatus.NotFound);
        AssertProblem(await _service.DeleteEntryAsync("e-gone", 1, Ct), ChangeStatus.NotFound);
    }

    [Fact]
    public async Task ARevisionIsRequiredToChangeAnEntry()
    {
        var topic = await AddTopic();
        var word = await AddEntry(topic.Id);

        AssertProblem(await _service.UpdateEntryAsync("t01", word.Key, Entry(topic.Id), Ct), ChangeStatus.Invalid, "revision");
    }

    [Fact]
    public async Task DeletesAnEntryOnlyFromTheRevisionTheTeacherSaw()
    {
        var topic = await AddTopic();
        var word = await AddEntry(topic.Id);
        await _service.UpdateEntryAsync("t02", word.Key, Entry(topic.Id, "hello", "helló", revision: 1), Ct);

        AssertProblem(await _service.DeleteEntryAsync(word.Key, 1, Ct), ChangeStatus.Stale);
        Assert.Equal(["hello"], await PublishedWords());

        Assert.True((await _service.DeleteEntryAsync(word.Key, 2, Ct)).Done);
        Assert.Empty(await PublishedWords());
    }

    // --- topics ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task AddsTopicsAtTheEndOfTheOrder()
    {
        var first = await AddTopic("Köszönések");
        var second = await AddTopic("Színek", teacher: "t02");

        Assert.Matches("^t-[a-z0-9]{10}$", first.Id);
        Assert.Equal((1, "Éva néni"), (first.Revision, first.UpdatedBy));
        Assert.Equal("Béla bácsi", second.UpdatedBy);
        var topics = JsonDocument.Parse((await _provider.GetAsync(Ct))!.Json).RootElement.GetProperty("topics");
        Assert.Equal(["Köszönések", "Színek"], topics.EnumerateArray().Select(t => t.GetProperty("name").GetString()));
    }

    [Fact]
    public async Task RefusesATopicWithABrokenValueOrAnExistingNameIgnoringCase()
    {
        await AddTopic("Színek");

        AssertProblem(await _service.AddTopicAsync("t01", Topic("SZÍNEK"), Ct), ChangeStatus.Invalid, "name");
        AssertProblem(await _service.AddTopicAsync("t01", Topic("Új", emoji: "x"), Ct), ChangeStatus.Invalid, "emoji");
    }

    [Fact]
    public async Task StopsAt50Topics()
    {
        for (var i = 0; i < DictionaryRules.MaxTopics; i++)
        {
            _store.Put(new TopicDocument($"t-{i}", 1, $"Téma {i}", "📦", "#000000", i + 1, "t01", Start));
        }

        AssertProblem(await _service.AddTopicAsync("t01", Topic("Egy túl sok"), Ct), ChangeStatus.Invalid, "topics");
    }

    [Fact]
    public async Task RenamesATopicWithOneWriteAndTheEntriesFollow()
    {
        var topic = await AddTopic("Szia");
        await AddEntry(topic.Id);

        var change = await _service.UpdateTopicAsync("t02", topic.Id, Topic("Köszönések", "🙏", "#ff0000", revision: 1), Ct);

        var renamed = Assert.IsType<DictionaryTopic>(change.Value);
        Assert.Equal((2, "Köszönések", "🙏", "Béla bácsi"), (renamed.Revision, renamed.Name, renamed.Emoji, renamed.UpdatedBy));
        var words = JsonDocument.Parse((await _provider.GetAsync(Ct))!.Json).RootElement.GetProperty("words");
        Assert.Equal("Köszönések", words[0].GetProperty("topic").GetString());
    }

    [Fact]
    public async Task ATopicMayKeepItsNameWhenChangedButNotTakeAnotherOnes()
    {
        var topic = await AddTopic("Szia");
        await AddTopic("Színek");

        Assert.True((await _service.UpdateTopicAsync("t01", topic.Id, Topic("SZIA", revision: 1), Ct)).Done);
        AssertProblem(await _service.UpdateTopicAsync("t01", topic.Id, Topic("színek", revision: 2), Ct), ChangeStatus.Invalid, "name");
    }

    [Fact]
    public async Task ChangingATopicFromAnOldRevisionGetsTheCurrentOne()
    {
        var topic = await AddTopic("Szia");
        await _service.UpdateTopicAsync("t02", topic.Id, Topic("Szia!", revision: 1), Ct);

        var stale = await _service.UpdateTopicAsync("t01", topic.Id, Topic("Szevasz", revision: 1), Ct);

        AssertProblem(stale, ChangeStatus.Stale);
        Assert.Equal(("Szia!", "Béla bácsi"), (((DictionaryTopic)stale.Problem!.Current!).Name, ((DictionaryTopic)stale.Problem.Current).UpdatedBy));
    }

    [Fact]
    public async Task ATopicWithEntriesCannotBeDeleted()
    {
        var topic = await AddTopic();
        var word = await AddEntry(topic.Id);

        AssertProblem(await _service.DeleteTopicAsync(topic.Id, 1, Ct), ChangeStatus.TopicNotEmpty);

        await _service.DeleteEntryAsync(word.Key, 1, Ct);
        Assert.True((await _service.DeleteTopicAsync(topic.Id, 1, Ct)).Done);
        AssertProblem(await _service.DeleteTopicAsync(topic.Id, 1, Ct), ChangeStatus.NotFound);
    }

    [Fact]
    public async Task ATopicIsDeletedOnlyFromTheRevisionTheTeacherSaw()
    {
        var topic = await AddTopic();
        await _service.UpdateTopicAsync("t02", topic.Id, Topic("Új név", revision: 1), Ct);

        AssertProblem(await _service.DeleteTopicAsync(topic.Id, 1, Ct), ChangeStatus.Stale);
    }

    [Fact]
    public async Task ReordersTopicsInOneBatchAndBumpsOnlyTheOnesThatMoved()
    {
        var a = await AddTopic("A");
        var b = await AddTopic("B");
        var c = await AddTopic("C");

        var change = await _service.SetTopicOrderAsync("t02", [b.Id, a.Id, c.Id], Ct);

        var topics = change.Value!;
        Assert.Equal(["B", "A", "C"], topics.Select(t => t.Name));
        Assert.Equal([2, 2, 1], topics.Select(t => t.Revision)); // C stayed where it was
        Assert.Equal(["Béla bácsi", "Béla bácsi", "Éva néni"], topics.Select(t => t.UpdatedBy));
        var published = JsonDocument.Parse((await _provider.GetAsync(Ct))!.Json).RootElement.GetProperty("topics");
        Assert.Equal(["B", "A", "C"], published.EnumerateArray().Select(t => t.GetProperty("name").GetString()));
    }

    [Fact]
    public async Task ReorderingToTheSameOrderChangesNothing()
    {
        var a = await AddTopic("A");
        var b = await AddTopic("B");

        var change = await _service.SetTopicOrderAsync("t01", [a.Id, b.Id], Ct);

        Assert.Equal([1, 1], change.Value!.Select(t => t.Revision));
    }

    [Fact]
    public async Task ARepeatedOrMissingTopicInTheOrderIsRefused()
    {
        var a = await AddTopic("A");
        var b = await AddTopic("B");

        AssertProblem(await _service.SetTopicOrderAsync("t01", [a.Id, a.Id], Ct), ChangeStatus.Invalid, "ids");
        AssertProblem(await _service.SetTopicOrderAsync("t01", [a.Id], Ct), ChangeStatus.Stale); // B was added meanwhile
        AssertProblem(await _service.SetTopicOrderAsync("t01", [a.Id, b.Id, "t-unknown"], Ct), ChangeStatus.Stale);
    }

    [Fact]
    public async Task ATopicChangedWhileReorderingFailsTheWholeBatch()
    {
        var a = await AddTopic("A");
        var b = await AddTopic("B");
        _store.BeforeReplaceAll = () => _store.Put(((TopicDocument)_store.GetAsync<TopicDocument>(a.Id, Ct).Result!.Document) with { Name = "Átnevezve", Revision = 2 });

        var change = await _service.SetTopicOrderAsync("t01", [b.Id, a.Id], Ct);

        AssertProblem(change, ChangeStatus.Stale);
        var order = (await _store.ReadAllAsync(Ct)).Topics.OrderBy(t => t.Order).Select(t => t.Name);
        Assert.Equal(["Átnevezve", "B"], order); // B did not move either
    }
}
