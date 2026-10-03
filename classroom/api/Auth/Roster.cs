using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace EnglishTutor.Api.Auth;

public static class Roles
{
    public const string Pupil = "pupil";
    public const string Teacher = "teacher";
}

/// <summary>Who a password belongs to. Returned by POST /api/login.</summary>
public sealed record Identity(string Id, string Name, string Role);

public sealed record Pupil(string Id, string Name);

/// <summary>
/// The class: pupils from the PUPILS_JSON setting and the teacher's password from TEACHER_PASSWORD.
/// A password alone identifies its owner. Passwords are compared by their letters and digits only,
/// ignoring case and accents, so "Piros-Róka 7" matches "piros-roka-7".
/// </summary>
public sealed partial class Roster
{
    public const int MinimumTeacherPasswordLength = 8;

    private readonly Dictionary<string, Identity> _byPassword;

    private Roster(IReadOnlyList<Pupil> pupils, Dictionary<string, Identity> byPassword, IReadOnlyList<string> problems)
    {
        Pupils = pupils;
        _byPassword = byPassword;
        Problems = problems;
    }

    /// <summary>The pupils with a usable entry, in configuration order.</summary>
    public IReadOnlyList<Pupil> Pupils { get; }

    /// <summary>Configuration mistakes, in Hungarian for the teacher's view. They never contain passwords.</summary>
    public IReadOnlyList<string> Problems { get; }

    public Identity? Identify(string? password)
    {
        var key = NormalizePassword(password);
        return key.Length > 0 && _byPassword.TryGetValue(key, out var identity) ? identity : null;
    }

    /// <summary>Lower-case letters and digits without accents: what passwords are compared by.</summary>
    public static string NormalizePassword(string? password)
    {
        if (string.IsNullOrEmpty(password)) return "";
        var result = new StringBuilder(password.Length);
        foreach (var c in password.Normalize(NormalizationForm.FormD))
        {
            if (char.IsLetterOrDigit(c) && CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                result.Append(char.ToLowerInvariant(c));
            }
        }
        return result.ToString();
    }

    /// <param name="pupilsJson">[{"id":"p01","name":"Anna","password":"piros-roka-7"}, ...]</param>
    public static Roster Parse(string? pupilsJson, string? teacherPassword)
    {
        var problems = new List<string>();
        var pupils = new List<Pupil>();
        var byPassword = new Dictionary<string, Identity>();
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var teacherKey = NormalizePassword(teacherPassword);
        if (teacherKey.Length >= MinimumTeacherPasswordLength)
        {
            byPassword[teacherKey] = new Identity(Roles.Teacher, "Tanár", Roles.Teacher);
        }
        else
        {
            problems.Add($"A TEACHER_PASSWORD hiányzik vagy túl rövid (legalább {MinimumTeacherPasswordLength} betű vagy szám kell), a tanári belépés ki van kapcsolva.");
        }

        foreach (var (entry, number) in ReadEntries(pupilsJson, problems))
        {
            var id = Text(entry, "id");
            var name = Text(entry, "name");
            var key = NormalizePassword(Text(entry, "password"));
            var label = id.Length > 0 ? $"A(z) '{id}' tanuló" : $"A(z) {number}. tanuló";
            if (!ValidId().IsMatch(id))
            {
                problems.Add($"{label}: az id csak angol betű, szám, - és _ lehet (legfeljebb 40 karakter) - kihagyva.");
            }
            else if (!ids.Add(id))
            {
                problems.Add($"{label}: ez az id már szerepel - kihagyva.");
            }
            else if (name.Length == 0)
            {
                problems.Add($"{label}: hiányzik a név - kihagyva.");
            }
            else if (key.Length < 4)
            {
                problems.Add($"{label}: hiányzik a jelszó, vagy 4 betűnél/számnál rövidebb - kihagyva.");
            }
            else if (byPassword.ContainsKey(key))
            {
                problems.Add($"{label}: a jelszava ugyanaz, mint egy másik tanulóé vagy a tanáré - kihagyva.");
            }
            else
            {
                pupils.Add(new Pupil(id, name));
                byPassword[key] = new Identity(id, name, Roles.Pupil);
            }
        }
        return new Roster(pupils, byPassword, problems);
    }

    private static IEnumerable<(JsonElement Entry, int Number)> ReadEntries(string? pupilsJson, List<string> problems)
    {
        if (string.IsNullOrWhiteSpace(pupilsJson))
        {
            problems.Add("A PUPILS_JSON beállítás üres, így egy tanuló sem tud belépni.");
            return [];
        }
        try
        {
            using var document = JsonDocument.Parse(pupilsJson, new JsonDocumentOptions { AllowTrailingCommas = true });
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                problems.Add("A PUPILS_JSON nem lista ([...]), így egy tanuló sem tud belépni.");
                return [];
            }
            return document.RootElement.EnumerateArray().Select((e, i) => (e.Clone(), i + 1)).ToList();
        }
        catch (JsonException e)
        {
            problems.Add($"A PUPILS_JSON nem érvényes JSON ({e.LineNumber + 1}. sor), így egy tanuló sem tud belépni.");
            return [];
        }
    }

    private static string Text(JsonElement entry, string property) =>
        entry.ValueKind == JsonValueKind.Object && entry.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()!.Trim()
            : "";

    [GeneratedRegex("^[A-Za-z0-9_-]{1,40}$")]
    private static partial Regex ValidId();
}
