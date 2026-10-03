using System.Text.Json;
using EnglishTutor.Api.Progress;

namespace EnglishTutor.Api.Tests;

public class ProgressSummaryTests
{
    [Fact]
    public void SummarisesTheFrontendStateObject()
    {
        var data = JsonDocument.Parse("""
            {
              "player": {"name": "Anna", "xp": 108, "stars": 4},
              "words": {
                "dog": {"lvl": 0}, "cat": {"lvl": 2}, "red": {"lvl": 5}, "blue": {"lvl": 5}, "odd": {"lvl": 9}
              },
              "days": {
                "2026-10-01": {"answers": 23}, "2026-10-02": {"answers": 0}, "2026-10-03": {"answers": 7}
              },
              "streak": {"current": 2, "best": 4, "lastDay": "2026-10-03"},
              "stats": {"rounds": 3, "answers": 30, "correct": 25}
            }
            """).RootElement;

        var summary = ProgressSummary.From(data);

        Assert.Equal((108, 4, 2, 4, "2026-10-03", 30, 25, 3),
            (summary.Xp, summary.Stars, summary.Streak, summary.BestStreak, summary.LastDay, summary.Answers, summary.Correct, summary.Rounds));
        Assert.Equal([1, 0, 1, 0, 0, 3], summary.WordsByLevel);
        Assert.Equal(new Dictionary<string, int> { ["2026-10-01"] = 23, ["2026-10-03"] = 7 }, summary.RecentDays);
    }

    [Fact]
    public void KeepsOnlyTheLastFourteenDaysWithPractice()
    {
        var days = string.Join(",", Enumerable.Range(1, 20).Select(d => $"\"2026-09-{d:00}\": {{\"answers\": {d}}}"));
        var data = JsonDocument.Parse("{\"player\": {}, \"days\": {" + days + "}}").RootElement;

        var recent = ProgressSummary.From(data).RecentDays;

        Assert.Equal(ProgressSummary.RecentDayCount, recent.Count);
        Assert.Equal("2026-09-07", recent.Keys.First());
        Assert.Equal("2026-09-20", recent.Keys.Last());
    }

    [Fact]
    public void ToleratesMissingAndOddFields()
    {
        var data = JsonDocument.Parse("""{"player": {"xp": "lots"}, "words": [], "streak": null}""").RootElement;

        var summary = ProgressSummary.From(data);

        Assert.Equal(0, summary.Xp);
        Assert.Equal([0, 0, 0, 0, 0, 0], summary.WordsByLevel);
        Assert.Null(summary.LastDay);
        Assert.Empty(summary.RecentDays);
    }
}
