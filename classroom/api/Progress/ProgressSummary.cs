using System.Text.Json;

namespace EnglishTutor.Api.Progress;

/// <summary>
/// The few numbers of a pupil's progress the teacher's class table shows. Computed from the
/// frontend's state object (web/js/state.js) on every save; missing or odd fields count as 0.
/// </summary>
/// <param name="WordsByLevel">How many words are at level 0, 1, ... 5 (5 = gold card).</param>
/// <param name="Streak">Days practised in a row, as of <paramref name="LastDay"/>.</param>
/// <param name="LastDay">The last day with any practice (yyyy-MM-dd, the pupil's local date).</param>
/// <param name="RecentDays">Answers per day for the last 14 days with any practice.</param>
public sealed record ProgressSummary(
    int Xp,
    int Stars,
    int[] WordsByLevel,
    int Streak,
    int BestStreak,
    string? LastDay,
    int Answers,
    int Correct,
    int Rounds,
    IReadOnlyDictionary<string, int> RecentDays)
{
    public const int RecentDayCount = 14;

    public static ProgressSummary From(JsonElement data)
    {
        var player = Child(data, "player");
        var streak = Child(data, "streak");
        var stats = Child(data, "stats");

        var wordsByLevel = new int[6];
        if (Child(data, "words") is { ValueKind: JsonValueKind.Object } words)
        {
            foreach (var word in words.EnumerateObject())
            {
                wordsByLevel[Math.Clamp(Number(word.Value, "lvl"), 0, 5)]++;
            }
        }

        var recentDays = new SortedDictionary<string, int>(StringComparer.Ordinal);
        if (Child(data, "days") is { ValueKind: JsonValueKind.Object } days)
        {
            foreach (var day in days.EnumerateObject().OrderByDescending(d => d.Name, StringComparer.Ordinal))
            {
                var answers = Number(day.Value, "answers");
                if (answers <= 0) continue;
                recentDays[day.Name] = answers;
                if (recentDays.Count == RecentDayCount) break;
            }
        }

        var lastDay = streak.ValueKind == JsonValueKind.Object && streak.TryGetProperty("lastDay", out var value)
            && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

        return new ProgressSummary(
            Xp: Number(player, "xp"),
            Stars: Number(player, "stars"),
            WordsByLevel: wordsByLevel,
            Streak: Number(streak, "current"),
            BestStreak: Number(streak, "best"),
            LastDay: lastDay,
            Answers: Number(stats, "answers"),
            Correct: Number(stats, "correct"),
            Rounds: Number(stats, "rounds"),
            RecentDays: recentDays);
    }

    private static JsonElement Child(JsonElement parent, string name) =>
        parent.ValueKind == JsonValueKind.Object && parent.TryGetProperty(name, out var child) ? child : default;

    private static int Number(JsonElement parent, string name) =>
        Child(parent, name) is { ValueKind: JsonValueKind.Number } n && n.TryGetDouble(out var d) && double.IsFinite(d)
            ? (int)Math.Clamp(d, int.MinValue, int.MaxValue)
            : 0;
}
