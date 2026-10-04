using EnglishTutor.Api.Dictionary;

namespace EnglishTutor.Api.Tests;

public class DictionaryRulesTests
{
    private static EntryInput Entry(
        string? kind = "word", string? topicId = "t-a", string? english = "hello", string[]? also = null,
        string? hu = "szia", string? note = "", string? visual = "") =>
        new(kind, topicId, english, also, hu, note, visual, null);

    private static ValidationError? Error(EntryInput input) => DictionaryRules.ValidateEntry(input).Error;

    [Fact]
    public void TrimsAndAcceptsAGoodEntry()
    {
        var (clean, error) = DictionaryRules.ValidateEntry(Entry(
            kind: " Phrase ", topicId: " t-a ", english: "  How do you do?  ", also: [" how d'you do "],
            hu: " Üdvözlöm! ", note: " hivatalos bemutatkozáskor ", visual: " 👋 "));

        Assert.Null(error);
        Assert.Equal(
            (EntryKind.Phrase, "t-a", "How do you do?", "Üdvözlöm!", "hivatalos bemutatkozáskor", "👋"),
            (clean!.Kind, clean.TopicId, clean.English, clean.Hu, clean.Note, clean.Visual));
        Assert.Equal(["how d'you do"], clean.AlsoAccepted);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("sentence")]
    public void RequiresAWordOrPhraseKind(string? kind)
    {
        Assert.Equal("kind", Error(Entry(kind: kind))?.Field);
    }

    [Fact]
    public void RequiresATopic()
    {
        Assert.Equal("topicId", Error(Entry(topicId: "  "))?.Field);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    [InlineData("123 !?")]
    [InlineData("привет")]
    public void RequiresEnglishTextWithAtLeastOneLetter(string? english)
    {
        Assert.Equal("english", Error(Entry(english: english))?.Field);
    }

    [Fact]
    public void LimitsLengthsAndRefusesLineBreaks()
    {
        Assert.Null(Error(Entry(english: new string('a', 60))));
        Assert.Equal("english", Error(Entry(english: new string('a', 61)))?.Field);
        Assert.Equal("english", Error(Entry(english: "two\nlines"))?.Field);
        Assert.Equal("hu", Error(Entry(hu: ""))?.Field);
        Assert.Equal("hu", Error(Entry(hu: new string('á', 61)))?.Field);
        Assert.Equal("hu", Error(Entry(hu: "két\r\nsor"))?.Field);
        Assert.Null(Error(Entry(note: new string('x', 80))));
        Assert.Equal("note", Error(Entry(note: new string('x', 81)))?.Field);
        Assert.Equal("note", Error(Entry(note: "két\nsor"))?.Field);
    }

    [Fact]
    public void LimitsTheOtherAcceptedSpellings()
    {
        Assert.Null(Error(Entry(also: ["a", "b", "c", "d", "e"])));
        Assert.Equal("alsoAccepted", Error(Entry(also: ["a", "b", "c", "d", "e", "f"]))?.Field);
        Assert.Equal("alsoAccepted", Error(Entry(also: ["fine", ""]))?.Field);
        Assert.Equal("alsoAccepted", Error(Entry(also: ["123"]))?.Field);
        Assert.Equal("alsoAccepted", Error(Entry(also: [new string('a', 61)]))?.Field);
    }

    [Theory]
    [InlineData("", true)]
    [InlineData("👋", true)]
    [InlineData("🖐️", true)]
    [InlineData("1️⃣", true)]
    [InlineData("👨‍👩‍👧", true)]
    [InlineData("🇭🇺", true)]
    [InlineData("color:#ff8800", true)]
    [InlineData("color:#FF8800", true)]
    [InlineData("a", false)]
    [InlineData("é", false)]
    [InlineData("1", false)]
    [InlineData("👋👋", false)]
    [InlineData("👋 a", false)]
    [InlineData("color:ff8800", false)]
    [InlineData("color:#ff88", false)]
    [InlineData("img:cat.png", false)]
    [InlineData("#ff8800", false)]
    public void AcceptsAnEmptyPictureOneEmojiOrAColour(string visual, bool valid)
    {
        Assert.Equal(valid, Error(Entry(visual: visual)) is null);
    }

    [Fact]
    public void ValidatesTopics()
    {
        Assert.Null(DictionaryRules.ValidateTopic(new("Köszönések", "👋", "#74c0fc", null)).Error);
        Assert.Equal("name", DictionaryRules.ValidateTopic(new("", "👋", "#74c0fc", null)).Error?.Field);
        Assert.Equal("name", DictionaryRules.ValidateTopic(new(new string('x', 31), "👋", "#74c0fc", null)).Error?.Field);
        Assert.Equal("emoji", DictionaryRules.ValidateTopic(new("Név", "ab", "#74c0fc", null)).Error?.Field);
        Assert.Equal("emoji", DictionaryRules.ValidateTopic(new("Név", "", "#74c0fc", null)).Error?.Field);
        Assert.Equal("color", DictionaryRules.ValidateTopic(new("Név", "👋", "blue", null)).Error?.Field);
        Assert.Equal("color", DictionaryRules.ValidateTopic(new("Név", "👋", null, null)).Error?.Field);
    }
}
