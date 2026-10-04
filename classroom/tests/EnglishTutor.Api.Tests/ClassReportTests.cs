using System.Text.Json;
using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Progress;

namespace EnglishTutor.Api.Tests;

public class ClassReportTests
{
    private static ProgressSummary Summary(int xp) =>
        ProgressSummary.From(JsonDocument.Parse("{\"player\": {\"xp\": " + xp + "}}").RootElement);

    [Fact]
    public void ListsEveryPupilInRosterOrderWithTheirSummary()
    {
        var roster = Roster.Parse("""
            [
              {"id": "p01", "name": "Anna", "password": "piros-roka-7"},
              {"id": "p02", "name": "Bence", "password": "kek-bagoly-3"},
              {"id": "p03", "name": "Csilla", "password": "zold-beka-1"}
            ]
            """, """[{"id": "t01", "name": "Éva néni", "password": "hosszu-tanari-jelszo"}]""");
        var updated = DateTimeOffset.Parse("2026-10-03T08:00:00Z");
        var rows = new[]
        {
            new ProgressSummaryRow("p03", 4, updated, Summary(30)),
            new ProgressSummaryRow("p01", 9, updated, Summary(120)),
            new ProgressSummaryRow("p99", 1, updated, Summary(5)), // no longer in the roster
        };

        var report = ClassReport.Build(roster, rows);

        Assert.Equal(["Anna", "Bence", "Csilla"], report.Pupils.Select(p => p.Name));
        Assert.Equal([120, (int?)null, 30], report.Pupils.Select(p => p.Summary?.Xp));
        Assert.Equal((9, updated), (report.Pupils[0].Revision, report.Pupils[0].UpdatedAt));
        Assert.Empty(report.Problems);
    }

    [Fact]
    public void PassesOnTheRosterProblems()
    {
        var report = ClassReport.Build(Roster.Parse("[]", ""), []);

        Assert.Empty(report.Pupils);
        Assert.Single(report.Problems);
    }
}
