using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace EnglishTutor.Api.Dictionary;

/// <summary>What a teacher sends when adding or changing an entry. <paramref name="Revision"/> is the revision the change is based on (not needed when adding).</summary>
public sealed record EntryInput(
    string? Kind,
    string? TopicId,
    string? English,
    string[]? AlsoAccepted,
    string? Hu,
    string? Note,
    string? Visual,
    int? Revision);

public sealed record TopicInput(string? Name, string? Emoji, string? Color, int? Revision);

public sealed record TopicOrderInput(string[]? Ids);

/// <summary>An entry's values after trimming and validation.</summary>
public sealed record CleanEntry(
    EntryKind Kind,
    string TopicId,
    string English,
    IReadOnlyList<string> AlsoAccepted,
    string Hu,
    string Note,
    string Visual);

public sealed record CleanTopic(string Name, string Emoji, string Color);

/// <summary>The rule that was broken, in Hungarian for the teacher; <paramref name="Field"/> is the JSON property it is about.</summary>
public sealed record ValidationError(string Field, string Message);

/// <summary>
/// The rules for entries and topics (docs/teacher-dictionary.md). The form in web/js/screens/teacher-dictionary.js
/// checks the same limits; this is the one that counts.
/// </summary>
public static partial class DictionaryRules
{
    public const int MaxTopics = 50;
    public const int MaxEntries = 1000;
    public const int MaxEnglishLength = 60;
    public const int MaxAlsoAccepted = 5;
    public const int MaxHuLength = 60;
    public const int MaxNoteLength = 80;
    public const int MaxTopicNameLength = 30;

    public static (CleanEntry? Entry, ValidationError? Error) ValidateEntry(EntryInput input)
    {
        if (!TryParseKind(input.Kind, out var kind))
        {
            return (null, new("kind", "A fajta csak szó vagy kifejezés lehet."));
        }
        var topicId = (input.TopicId ?? "").Trim();
        if (topicId.Length == 0)
        {
            return (null, new("topicId", "Válassz témát."));
        }
        var (english, englishError) = Text(input.English, "Az angol szöveg", "english", MaxEnglishLength, required: true);
        if (englishError is not null) return (null, englishError);
        if (Spelling.LettersOnly(english).Length == 0)
        {
            return (null, new("english", "Az angol szövegben legalább egy angol betűnek (a–z) lennie kell."));
        }

        var alsoAccepted = new List<string>();
        var others = input.AlsoAccepted ?? [];
        if (others.Length > MaxAlsoAccepted)
        {
            return (null, new("alsoAccepted", $"Legfeljebb {MaxAlsoAccepted} más elfogadott alak adható meg."));
        }
        foreach (var other in others)
        {
            var (text, error) = Text(other, "Az elfogadott alak", "alsoAccepted", MaxEnglishLength, required: true);
            if (error is not null) return (null, error);
            if (Spelling.LettersOnly(text).Length == 0)
            {
                return (null, new("alsoAccepted", $"A(z) '{text}' elfogadott alakban legalább egy angol betűnek (a–z) lennie kell."));
            }
            alsoAccepted.Add(text);
        }

        var (hu, huError) = Text(input.Hu, "A magyar jelentés", "hu", MaxHuLength, required: true);
        if (huError is not null) return (null, huError);
        var (note, noteError) = Text(input.Note, "A megjegyzés", "note", MaxNoteLength, required: false);
        if (noteError is not null) return (null, noteError);

        var visual = (input.Visual ?? "").Trim();
        if (visual.Length > 0 && !IsHexColor(visual.StartsWith("color:", StringComparison.Ordinal) ? visual[6..] : "") && !IsOneEmoji(visual))
        {
            return (null, new("visual", "A kép csak egy emoji, egy szín (color:#rrggbb) vagy üres lehet."));
        }
        return (new CleanEntry(kind, topicId, english, alsoAccepted, hu, note, visual), null);
    }

    public static (CleanTopic? Topic, ValidationError? Error) ValidateTopic(TopicInput input)
    {
        var (name, nameError) = Text(input.Name, "A téma neve", "name", MaxTopicNameLength, required: true);
        if (nameError is not null) return (null, nameError);
        var emoji = (input.Emoji ?? "").Trim();
        if (!IsOneEmoji(emoji))
        {
            return (null, new("emoji", "A téma jele egyetlen emoji lehet."));
        }
        var color = (input.Color ?? "").Trim();
        if (!IsHexColor(color))
        {
            return (null, new("color", "A téma színe #rrggbb alakú legyen."));
        }
        return (new CleanTopic(name, emoji, color), null);
    }

    /// <summary>One emoji: a single character as the user sees it (a flag or a family counts as one), and not a plain letter or digit.</summary>
    public static bool IsOneEmoji(string text)
    {
        if (text.Length == 0) return false;
        var elements = StringInfo.GetTextElementEnumerator(text);
        if (!elements.MoveNext()) return false;
        var element = elements.GetTextElement();
        if (elements.MoveNext()) return false;
        // The keycap emoji "1️⃣" starts with a digit but has more in it; a bare "1" or "a" is not an emoji.
        return element.Any(c => c > 0x7F) && !Rune.IsLetter(Rune.GetRuneAt(element, 0));
    }

    public static bool IsHexColor(string text) => HexColor().IsMatch(text);

    private static bool TryParseKind(string? text, out EntryKind kind)
    {
        switch (text?.Trim().ToLowerInvariant())
        {
            case "word": kind = EntryKind.Word; return true;
            case "phrase": kind = EntryKind.Phrase; return true;
            default: kind = default; return false;
        }
    }

    private static (string Value, ValidationError? Error) Text(string? raw, string label, string field, int max, bool required)
    {
        var text = (raw ?? "").Trim();
        if (text.Length == 0 && required) return ("", new(field, $"{label} kötelező."));
        if (text.Length > max) return (text, new(field, $"{label} legfeljebb {max} karakter lehet."));
        if (text.Any(char.IsControl)) return (text, new(field, $"{label} nem lehet többsoros, és nem tartalmazhat vezérlőkaraktert."));
        return (text, null);
    }

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();
}
