using System.Text.Json;
using EnglishTutor.Api.Dictionary;

namespace EnglishTutor.Api.Tests;

public class DictionaryResponseTests
{
    private static readonly DateTimeOffset At = DateTimeOffset.Parse("2026-10-04T08:15:00Z");

    private static TopicDocument Topic(string id, string name, int order, string updatedBy = "t01") =>
        new(id, 1, name, "👋", "#74c0fc", order, updatedBy, At);

    private static EntryDocument Entry(
        string id, string topicId, string english, string hu = "magyar", string visual = "", string[]? also = null,
        EntryKind kind = EntryKind.Word, string note = "", string updatedBy = "t01") =>
        new(id, 1, kind, topicId, english, also ?? [], hu, note, visual, updatedBy, At);

    private static DictionaryResponse Build(TopicDocument[] topics, params EntryDocument[] entries) =>
        DictionaryResponse.Build(new DictionaryContent(topics, entries), id => id == "t01" ? "Éva néni" : id);

    /// <summary>A topic with enough pictured entries to give no warnings of its own.</summary>
    private static EntryDocument[] Filler(string topicId, int count = 4) =>
        Enumerable.Range(1, count).Select(i => Entry($"{topicId}-{i}", topicId, $"{topicId} word {(char)('a' + i)}", visual: "⭐")).ToArray();

    [Fact]
    public void OrdersTopicsByTheirOrderAndEntriesByTopicThenAlphabetically()
    {
        var response = Build(
            [Topic("t-b", "Színek", 2), Topic("t-a", "Köszönések", 1)],
            Entry("e1", "t-b", "red", visual: "🟥"),
            Entry("e2", "t-a", "Thanks", visual: "🙏"),
            Entry("e3", "t-b", "blue", visual: "🟦"),
            Entry("e4", "t-a", "hello", visual: "👋"));

        Assert.Equal(["Köszönések", "Színek"], response.Topics.Select(t => t.Name));
        Assert.Equal(["hello", "Thanks", "blue", "red"], response.Words.Select(w => w.English));
    }

    [Fact]
    public void FillsInTheFieldsTheGamesNeed()
    {
        var response = Build(
            [Topic("t-a", "Köszönések", 1)],
            Entry("e-7k3j9x2q4m", "t-a", "How do you do?", "Üdvözlöm!", also: ["How d'you do?"], kind: EntryKind.Phrase, note: "hivatalos bemutatkozáskor"));

        var word = Assert.Single(response.Words);
        Assert.Equal("e-7k3j9x2q4m", word.Key);
        Assert.Equal(("t-a", "Köszönések", EntryKind.Phrase), (word.TopicId, word.Topic, word.Kind));
        Assert.Equal(["How do you do?", "How d'you do?"], word.Alts);
        Assert.Equal(("Üdvözlöm!", "hivatalos bemutatkozáskor", ""), (word.Hu, word.Note, word.Visual));
        Assert.Equal((1, "Éva néni", At), (word.Revision, word.UpdatedBy, word.UpdatedAt));
        var topic = Assert.Single(response.Topics);
        Assert.Equal(("t-a", "Köszönések", "👋", "#74c0fc", "Éva néni"), (topic.Id, topic.Name, topic.Emoji, topic.Color, topic.UpdatedBy));
    }

    [Fact]
    public void ShowsTheIdOfATeacherWhoIsNoLongerListed()
    {
        var response = Build([Topic("t-a", "Köszönések", 1, updatedBy: "t99")], Entry("e1", "t-a", "hello", updatedBy: "t98"));

        Assert.Equal("t99", response.Topics[0].UpdatedBy);
        Assert.Equal("t98", response.Words[0].UpdatedBy);
    }

    [Fact]
    public void KeepsEmptyTopicsForTheTeachers()
    {
        var response = Build([Topic("t-a", "Üres", 1), Topic("t-b", "Tele", 2)], Filler("t-b"));

        Assert.Equal(["Üres", "Tele"], response.Topics.Select(t => t.Name));
        Assert.Equal(["A(z) 'Üres' téma üres."], response.Warnings);
    }

    [Fact]
    public void LeavesOutEntriesWhoseTopicIsGoneAndSaysSo()
    {
        var response = Build([Topic("t-a", "Tele", 1)], [.. Filler("t-a"), Entry("e-x", "t-gone", "orphan")]);

        Assert.DoesNotContain(response.Words, w => w.English == "orphan");
        Assert.Equal(["A(z) 'orphan' bejegyzés témája nem létezik - kihagyva."], response.Warnings);
    }

    [Fact]
    public void WarnsAboutTopicsWithTooFewEntries()
    {
        var response = Build([Topic("t-a", "Kevés", 1)], Filler("t-a", count: 3));

        Assert.Equal(
            ["A(z) 'Kevés' témában csak 3 bejegyzés van; legalább 4 kell a feleletválasztós és a párosító játékokhoz."],
            response.Warnings);
    }

    [Fact]
    public void WarnsOnceAboutEntriesWithoutAPictureWithAFewExamples()
    {
        string[] words = ["the", "of", "to", "and", "in", "is", "dog"];
        var entries = words.Select((w, i) => Entry($"e{i}", "t-a", w, visual: w == "dog" ? "🐶" : "")).ToArray();

        var response = Build([Topic("t-a", "Szavak", 1)], entries);

        Assert.Equal(
            ["6 bejegyzéshez nincs kép (pl. and, in, is, of, the) - ezeket szöveges feladatokban gyakorolják."],
            response.Warnings);
    }

    [Fact]
    public void WarnsAboutEntriesThatShareASpellingIgnoringCaseAccentsAndPunctuation()
    {
        var response = Build(
            [Topic("t-a", "Köszönések", 1)],
            [.. Filler("t-a"),
             Entry("e-1", "t-a", "Thank you", visual: "🙏", also: ["thanks"]),
             Entry("e-2", "t-a", "Thanks!", visual: "🙏", also: ["Thank-you"]),
             Entry("e-3", "t-a", "Café", visual: "☕")]);

        // Two shared spellings, but one problem.
        Assert.Equal(
            ["Lehetséges ismétlődés: 'Thank you', 'Thanks!' - a gépelős játékban ugyanazt a választ fogadja el mindegyik."],
            response.Warnings);
    }

    [Fact]
    public void DoesNotCallAnEntrysOwnSpellingsDuplicates()
    {
        var response = Build(
            [Topic("t-a", "Köszönések", 1)],
            [.. Filler("t-a"), Entry("e-1", "t-a", "Thank you", visual: "🙏", also: ["thank-you", "Thanks"])]);

        Assert.Empty(response.Warnings);
    }

    [Fact]
    public void SerializesToTheShapeTheFrontendExpects()
    {
        var response = Build(
            [Topic("t-4m8p2w6c3n", "Köszönések", 3)],
            Entry("e-7k3j9x2q4m", "t-4m8p2w6c3n", "How do you do?", "Üdvözlöm!", kind: EntryKind.Phrase, note: "hivatalos bemutatkozáskor"));

        using var json = JsonDocument.Parse(JsonSerializer.SerializeToUtf8Bytes(response, JsonDefaults.Options));

        Assert.Equal(["topics", "words", "warnings"], json.RootElement.EnumerateObject().Select(p => p.Name));
        var topic = json.RootElement.GetProperty("topics")[0];
        Assert.Equal(
            ["id", "name", "emoji", "color", "revision", "updatedBy", "updatedAt"],
            topic.EnumerateObject().Select(p => p.Name));
        var word = json.RootElement.GetProperty("words")[0];
        Assert.Equal(
            ["key", "topicId", "topic", "kind", "english", "alts", "hu", "note", "visual", "revision", "updatedBy", "updatedAt"],
            word.EnumerateObject().Select(p => p.Name));
        Assert.Equal("phrase", word.GetProperty("kind").GetString());
        Assert.Equal("Üdvözlöm!", word.GetProperty("hu").GetString());
    }
}
