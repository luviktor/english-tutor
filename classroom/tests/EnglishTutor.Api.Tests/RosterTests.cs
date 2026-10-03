using EnglishTutor.Api.Auth;

namespace EnglishTutor.Api.Tests;

public class RosterTests
{
    private const string Pupils = """
        [
          {"id": "p01", "name": "Anna", "password": "piros-roka-7"},
          {"id": "p02", "name": "Bence", "password": "kek-bagoly-3"}
        ]
        """;

    private const string TeacherPassword = "Hosszu-Tanari-Jelszo-2026";

    [Theory]
    [InlineData("piros-roka-7")]
    [InlineData("  PIROS-ROKA-7 ")]
    [InlineData("piros róka 7")]
    [InlineData("pirosroka7")]
    public void IdentifiesAPupilIgnoringCaseAccentsAndSeparators(string typed)
    {
        var roster = Roster.Parse(Pupils, TeacherPassword);

        Assert.Equal(new Identity("p01", "Anna", Roles.Pupil), roster.Identify(typed));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("piros-roka-8")]
    [InlineData("-")]
    public void RejectsUnknownPasswords(string? typed)
    {
        Assert.Null(Roster.Parse(Pupils, TeacherPassword).Identify(typed));
    }

    [Fact]
    public void IdentifiesTheTeacher()
    {
        var roster = Roster.Parse(Pupils, TeacherPassword);

        Assert.Equal(Roles.Teacher, roster.Identify("hosszu-tanari-jelszo-2026")?.Role);
        Assert.Equal([new Pupil("p01", "Anna"), new Pupil("p02", "Bence")], roster.Pupils);
        Assert.Empty(roster.Problems);
    }

    [Fact]
    public void DisablesTheTeacherLoginWithAShortPassword()
    {
        var roster = Roster.Parse(Pupils, "rovid");

        Assert.Null(roster.Identify("rovid"));
        Assert.Single(roster.Problems);
    }

    [Fact]
    public void SkipsBadEntriesAndReportsThemWithoutPasswords()
    {
        var roster = Roster.Parse("""
            [
              {"id": "p01", "name": "Anna", "password": "piros-roka-7"},
              {"id": "p02", "name": "Bence", "password": "PIROS roka 7"},
              {"id": "p01", "name": "Csilla", "password": "zold-beka-1"},
              {"id": "p 04", "name": "Dani", "password": "sarga-lo-2"},
              {"id": "p05", "name": "", "password": "lila-hal-5"},
              {"id": "p06", "name": "Emma", "password": "x1"}
            ]
            """, TeacherPassword);

        Assert.Equal([new Pupil("p01", "Anna")], roster.Pupils);
        Assert.Equal(5, roster.Problems.Count);
        Assert.DoesNotContain(roster.Problems, p => p.Contains("roka") || p.Contains("beka") || p.Contains("x1"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not json")]
    [InlineData("""{"id": "p01"}""")]
    public void ReportsAMissingOrInvalidPupilList(string? json)
    {
        var roster = Roster.Parse(json, TeacherPassword);

        Assert.Empty(roster.Pupils);
        Assert.Single(roster.Problems);
        Assert.NotNull(roster.Identify(TeacherPassword));
    }
}
