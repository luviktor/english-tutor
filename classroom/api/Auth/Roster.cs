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

public sealed record Teacher(string Id, string Name);

/// <summary>
/// The people who can log in: teachers from the TEACHERS_JSON setting and pupils from PUPILS_JSON.
/// A password alone identifies its owner. Passwords are compared by their letters and digits only,
/// ignoring case and accents, so "Piros-Róka 7" matches "piros-roka-7".
/// </summary>
public sealed partial class Roster
{
    public const int MinimumPupilPasswordLength = 4;
    public const int MinimumTeacherPasswordLength = 8;

    private static readonly Group PupilGroup = new(
        "PUPILS_JSON", "tanuló", Roles.Pupil, MinimumPupilPasswordLength, "mint egy másik tanulóé vagy egy tanáré");

    private static readonly Group TeacherGroup = new(
        "TEACHERS_JSON", "tanár", Roles.Teacher, MinimumTeacherPasswordLength, "mint egy másik tanáré");

    private readonly Dictionary<string, Identity> _byPassword;

    private Roster(
        IReadOnlyList<Pupil> pupils, IReadOnlyList<Teacher> teachers,
        Dictionary<string, Identity> byPassword, IReadOnlyList<string> problems)
    {
        Pupils = pupils;
        Teachers = teachers;
        _byPassword = byPassword;
        Problems = problems;
    }

    /// <summary>The pupils with a usable entry, in configuration order.</summary>
    public IReadOnlyList<Pupil> Pupils { get; }

    /// <summary>The teachers with a usable entry, in configuration order.</summary>
    public IReadOnlyList<Teacher> Teachers { get; }

    /// <summary>Configuration mistakes, in Hungarian for the teacher's view. They never contain passwords.</summary>
    public IReadOnlyList<string> Problems { get; }

    /// <summary>The teacher's name, or the id itself when that teacher is no longer in TEACHERS_JSON.</summary>
    public string TeacherName(string id) =>
        Teachers.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase))?.Name ?? id;

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
    /// <param name="teachersJson">[{"id":"t01","name":"Éva néni","password":"hosszu-tanari-jelszo-1"}, ...]</param>
    public static Roster Parse(string? pupilsJson, string? teachersJson)
    {
        var problems = new List<string>();
        var byPassword = new Dictionary<string, Identity>();
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Teachers first: when a pupil clashes with a teacher, the pupil is the one left out.
        var teachers = ReadPeople(teachersJson, TeacherGroup, byPassword, ids, problems);
        var pupils = ReadPeople(pupilsJson, PupilGroup, byPassword, ids, problems);
        return new Roster(
            pupils.Select(p => new Pupil(p.Id, p.Name)).ToList(),
            teachers.Select(t => new Teacher(t.Id, t.Name)).ToList(),
            byPassword,
            problems);
    }

    /// <summary>Adds the usable entries to <paramref name="byPassword"/> and <paramref name="ids"/>; returns them.</summary>
    private static List<(string Id, string Name)> ReadPeople(
        string? json, Group group, Dictionary<string, Identity> byPassword, HashSet<string> ids, List<string> problems)
    {
        var people = new List<(string Id, string Name)>();
        foreach (var (entry, number) in ReadEntries(json, group, problems))
        {
            var id = Text(entry, "id");
            var name = Text(entry, "name");
            var key = NormalizePassword(Text(entry, "password"));
            var label = id.Length > 0 ? $"A(z) '{id}' {group.Noun}" : $"A(z) {number}. {group.Noun}";
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
            else if (key.Length < group.MinimumPasswordLength)
            {
                problems.Add($"{label}: hiányzik a jelszó, vagy {group.MinimumPasswordLength} betűnél/számnál rövidebb - kihagyva.");
            }
            else if (byPassword.ContainsKey(key))
            {
                problems.Add($"{label}: a jelszava ugyanaz, {group.PasswordClash} - kihagyva.");
            }
            else
            {
                people.Add((id, name));
                byPassword[key] = new Identity(id, name, group.Role);
            }
        }
        return people;
    }

    private static IEnumerable<(JsonElement Entry, int Number)> ReadEntries(string? json, Group group, List<string> problems)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            problems.Add($"A {group.Setting} beállítás üres, így egy {group.Noun} sem tud belépni.");
            return [];
        }
        try
        {
            using var document = JsonDocument.Parse(json, new JsonDocumentOptions { AllowTrailingCommas = true });
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                problems.Add($"A {group.Setting} nem lista ([...]), így egy {group.Noun} sem tud belépni.");
                return [];
            }
            return document.RootElement.EnumerateArray().Select((e, i) => (e.Clone(), i + 1)).ToList();
        }
        catch (JsonException e)
        {
            problems.Add($"A {group.Setting} nem érvényes JSON ({e.LineNumber + 1}. sor), így egy {group.Noun} sem tud belépni.");
            return [];
        }
    }

    private static string Text(JsonElement entry, string property) =>
        entry.ValueKind == JsonValueKind.Object && entry.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()!.Trim()
            : "";

    /// <param name="Noun">What an entry is called in the messages, e.g. "tanuló".</param>
    /// <param name="PasswordClash">Completes "a jelszava ugyanaz, ...": who else may already have the password.</param>
    private sealed record Group(string Setting, string Noun, string Role, int MinimumPasswordLength, string PasswordClash);

    [GeneratedRegex("^[A-Za-z0-9_-]{1,40}$")]
    private static partial Regex ValidId();
}
