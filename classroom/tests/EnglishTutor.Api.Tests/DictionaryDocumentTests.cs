using System.Text.Json;
using EnglishTutor.Api.Dictionary;

namespace EnglishTutor.Api.Tests;

public class DictionaryDocumentTests
{
    private static readonly DateTimeOffset At = DateTimeOffset.Parse("2026-10-04T08:15:00Z");

    private static readonly EntryDocument Entry = new(
        "e-7k3j9x2q4m", 1, EntryKind.Phrase, "t-4m8p2w6c3n", "How do you do?", [], "Üdvözlöm!", "hivatalos bemutatkozáskor", "", "t01", At);

    private static readonly TopicDocument Topic = new("t-4m8p2w6c3n", 1, "Köszönések", "👋", "#74c0fc", 3, "t01", At);

    private static JsonElement Json(DictionaryDocument document) =>
        JsonDocument.Parse(JsonSerializer.SerializeToUtf8Bytes(document, JsonDefaults.Options)).RootElement;

    [Fact]
    public void StoresAnEntryWithItsTypeAndPartitionKey()
    {
        var json = Json(Entry);

        Assert.Equal("entry", json.GetProperty("type").GetString());
        Assert.Equal("class", json.GetProperty("classId").GetString());
        Assert.Equal("phrase", json.GetProperty("kind").GetString());
        Assert.Equal("e-7k3j9x2q4m", json.GetProperty("id").GetString());
        Assert.Equal("t-4m8p2w6c3n", json.GetProperty("topicId").GetString());
        Assert.Equal("t01", json.GetProperty("updatedBy").GetString());
        Assert.Equal(JsonValueKind.Array, json.GetProperty("alsoAccepted").ValueKind);
    }

    [Fact]
    public void StoresATopicWithItsTypeAndPartitionKey()
    {
        var json = Json(Topic);

        Assert.Equal("topic", json.GetProperty("type").GetString());
        Assert.Equal("class", json.GetProperty("classId").GetString());
        Assert.Equal(3, json.GetProperty("order").GetInt32());
    }

    [Fact]
    public void ReadsBackWhateverWasStoredThroughTheBaseType()
    {
        DictionaryDocument[] documents = [Entry, Topic, Entry with { AlsoAccepted = ["how d'you do"], Visual = "color:#ff0000" }];

        foreach (var document in documents)
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(document, JsonDefaults.Options);

            var read = JsonSerializer.Deserialize<DictionaryDocument>(bytes, JsonDefaults.Options)!;

            Assert.Equal(document.GetType(), read.GetType());
            Assert.Equal(Json(document).ToString(), Json(read).ToString());
        }
    }

    [Fact]
    public void ReadsADocumentAsCosmosReturnsIt()
    {
        // Cosmos adds its own properties after ours, and the type need not come first.
        const string json = """
            {"id": "t-4m8p2w6c3n", "classId": "class", "revision": 2, "name": "Köszönések", "emoji": "👋", "color": "#74c0fc",
             "order": 3, "updatedBy": "t01", "updatedAt": "2026-10-04T08:15:00+00:00", "type": "topic",
             "_rid": "abc", "_self": "dbs/x", "_etag": "\"00000000-0000-0000-0000-000000000000\"", "_attachments": "attachments/", "_ts": 1759565700}
            """;

        var topic = Assert.IsType<TopicDocument>(JsonSerializer.Deserialize<DictionaryDocument>(json, JsonDefaults.Options));

        Assert.Equal(("t-4m8p2w6c3n", 2, "Köszönések", 3), (topic.Id, topic.Revision, topic.Name, topic.Order));
    }

    [Theory]
    [InlineData("Thank you!", "thankyou")]
    [InlineData("THANK-YOU", "thankyou")]
    [InlineData("  Café au lait ", "cafeaulait")]
    [InlineData("1, 2, 3", "")]
    [InlineData("Üdvözlöm", "udvozlom")]
    [InlineData(null, "")]
    public void ComparesSpellingsByLettersOnly(string? typed, string expected)
    {
        Assert.Equal(expected, Spelling.LettersOnly(typed));
    }
}
