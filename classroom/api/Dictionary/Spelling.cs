using System.Globalization;
using System.Text;

namespace EnglishTutor.Api.Dictionary;

public static class Spelling
{
    /// <summary>
    /// Lower-case letters a-z without accents: what the typing game compares answers by (lettersOnly() in
    /// web/js/util.js). "Thank you!" and "thank-you" are the same spelling.
    /// </summary>
    public static string LettersOnly(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var result = new StringBuilder(text.Length);
        foreach (var c in text.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            var lower = char.ToLowerInvariant(c);
            if (lower is >= 'a' and <= 'z') result.Append(lower);
        }
        return result.ToString();
    }

    /// <summary>The distinct non-empty <see cref="LettersOnly"/> forms of an entry's spellings: what it is found by.</summary>
    public static HashSet<string> Keys(string english, IEnumerable<string> alsoAccepted) =>
        alsoAccepted.Prepend(english).Select(LettersOnly).Where(key => key.Length > 0).ToHashSet();
}
