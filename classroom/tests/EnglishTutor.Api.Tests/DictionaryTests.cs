using System.Text;
using EnglishTutor.Api.Dictionary;

namespace EnglishTutor.Api.Tests;

public class DictionaryTests
{
    private static WordDictionary Build(string dictionaryCsv, string topicsCsv = "") =>
        WordDictionary.Build(CsvTable.Parse(dictionaryCsv), CsvTable.Parse(topicsCsv));

    [Fact]
    public void BundledDictionaryHasNoWarnings()
    {
        var dictionary = WordDictionary.Load(Path.Combine(AppContext.BaseDirectory, "data"));

        Assert.Empty(dictionary.Warnings);
        Assert.True(dictionary.Words.Count > 100);
        Assert.Equal(dictionary.Topics.Count, dictionary.Words.Select(w => w.Topic).Distinct().Count());
    }

    [Fact]
    public void AcceptsHungarianHeadersCommentsAndAlternativeSpellings()
    {
        var dictionary = Build("""
            # comment

            Téma;Angol;Magyar;Kép
            Család;mother|mum | mom ;anya;👩
            """);

        var word = Assert.Single(dictionary.Words);
        Assert.Equal(("mother", "Család", "mother", "anya", "👩"), (word.Key, word.Topic, word.English, word.Hu, word.Visual));
        Assert.Equal(["mother", "mum", "mom"], word.Alts);
        Assert.Empty(dictionary.Warnings);
    }

    [Fact]
    public void DetectsCommaSeparatorAndQuotedFields()
    {
        var dictionary = Build("topic,english,hungarian,emoji\r\nFood,\"ice cream, vanilla\",fagyi,🍦\r\nFood,\"say \"\"hi\"\"\",köszönj,👋\r\n");

        Assert.Equal(["ice cream, vanilla", "say \"hi\""], dictionary.Words.Select(w => w.English));
    }

    [Fact]
    public void ReadsWindows1250()
    {
        var bytes = CodePagesEncodingProvider.Instance.GetEncoding(1250)!
            .GetBytes("topic;english;hungarian;emoji\nŐsz;autumn;ősz;🍂\n");

        var dictionary = WordDictionary.Build(CsvTable.Parse(CsvTable.Decode(bytes)), []);

        Assert.Equal(("Ősz", "ősz"), (dictionary.Words[0].Topic, dictionary.Words[0].Hu));
    }

    [Fact]
    public void StripsTheUtf8ByteOrderMark()
    {
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes("topic;english;hungarian;emoji\nA;one;egy;1️⃣\n")).ToArray();

        Assert.Single(WordDictionary.Build(CsvTable.Parse(CsvTable.Decode(bytes)), []).Words);
    }

    [Fact]
    public void ReportsBadRowsAsWarningsWithLineNumbers()
    {
        var dictionary = Build("""
            topic;english;hungarian;emoji
            Állatok;dog;kutya;🐶
            Állatok;Dog;kutya;🐕
            ;cat;macska;🐱
            Színek;blue;kék;
            """);

        Assert.Equal(["dog", "blue"], dictionary.Words.Select(w => w.Key));
        Assert.Equal(
            [
                "dictionary.csv, 3. sor: a(z) 'Dog' szó már szerepel - kihagyva.",
                "dictionary.csv, 4. sor: hiányzik a téma, az angol vagy a magyar szó - kihagyva.",
                "dictionary.csv: 1 szóhoz nincs kép (pl. blue) - ezeket szöveges feladatokban gyakorolják.",
            ],
            dictionary.Warnings);
    }

    [Fact]
    public void KeepsWordsWithoutPictureAndWarnsOnceWithAFewExamples()
    {
        var dictionary = Build("""
            topic;english;hungarian;emoji
            Szavak;the;a;
            Szavak;of;-nak;
            Szavak;to;hoz;
            Szavak;and;és;
            Szavak;in;-ban;
            Szavak;is;van;
            Szavak;dog;kutya;🐶
            """);

        Assert.Equal(7, dictionary.Words.Count);
        Assert.Equal(6, dictionary.Words.Count(w => w.Visual.Length == 0));
        Assert.Equal("🐶", dictionary.Words[^1].Visual);
        Assert.Equal(
            ["dictionary.csv: 6 szóhoz nincs kép (pl. the, of, to, and, in) - ezeket szöveges feladatokban gyakorolják."],
            dictionary.Warnings);
    }

    [Fact]
    public void TopicEmojiIsABookWhenItsFirstWordHasNoPicture()
    {
        var dictionary = Build("""
            topic;english;hungarian;emoji
            Szavak;the;a;
            """);

        Assert.Equal("📚", Assert.Single(dictionary.Topics).Emoji);
    }

    [Fact]
    public void WarnsWhenTheDictionaryIsEmpty()
    {
        Assert.Equal(["A szótár üres vagy nem olvasható: data/dictionary.csv"], Build("").Warnings);
    }

    [Fact]
    public void OrdersTopicsByTopicsCsvAndFillsInEmojiAndColours()
    {
        var dictionary = Build(
            """
            topic;english;hungarian;emoji
            Állatok;dog;kutya;🐶
            Színek;red;piros;color:#e53935
            Új;sun;nap;☀️
            """,
            """
            topic;emoji;color
            Színek;;#123456
            Üres;📦;#000000
            Állatok;🐾;
            """);

        Assert.Equal(
            [new Topic("Színek", "📚", "#123456"), new Topic("Állatok", "🐾", "#ff6b9d"), new Topic("Új", "☀️", "#4dabf7")],
            dictionary.Topics);
    }
}
