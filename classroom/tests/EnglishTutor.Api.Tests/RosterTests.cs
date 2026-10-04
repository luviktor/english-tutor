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

    private const string Teachers = """
        [
          {"id": "t01", "name": "Éva néni", "password": "Hosszu-Tanari-Jelszo-1"},
          {"id": "t02", "name": "Béla bácsi", "password": "masik-tanari-jelszo-2"}
        ]
        """;

    [Theory]
    [InlineData("piros-roka-7")]
    [InlineData("  PIROS-ROKA-7 ")]
    [InlineData("piros róka 7")]
    [InlineData("pirosroka7")]
    public void IdentifiesAPupilIgnoringCaseAccentsAndSeparators(string typed)
    {
        var roster = Roster.Parse(Pupils, Teachers);

        Assert.Equal(new Identity("p01", "Anna", Roles.Pupil), roster.Identify(typed));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("piros-roka-8")]
    [InlineData("-")]
    public void RejectsUnknownPasswords(string? typed)
    {
        Assert.Null(Roster.Parse(Pupils, Teachers).Identify(typed));
    }

    [Fact]
    public void IdentifiesEachTeacherByTheirOwnPassword()
    {
        var roster = Roster.Parse(Pupils, Teachers);

        Assert.Equal(new Identity("t01", "Éva néni", Roles.Teacher), roster.Identify("hosszu-tanari-jelszo-1"));
        Assert.Equal(new Identity("t02", "Béla bácsi", Roles.Teacher), roster.Identify("Másik tanári jelszó 2"));
        Assert.Equal([new Teacher("t01", "Éva néni"), new Teacher("t02", "Béla bácsi")], roster.Teachers);
        Assert.Equal([new Pupil("p01", "Anna"), new Pupil("p02", "Bence")], roster.Pupils);
        Assert.Empty(roster.Problems);
    }

    [Fact]
    public void NamesATeacherByIdOrFallsBackToTheId()
    {
        var roster = Roster.Parse(Pupils, Teachers);

        Assert.Equal("Éva néni", roster.TeacherName("t01"));
        Assert.Equal("Béla bácsi", roster.TeacherName("T02"));
        Assert.Equal("t99", roster.TeacherName("t99"));
    }

    [Fact]
    public void SkipsATeacherWithAShortPassword()
    {
        var roster = Roster.Parse(Pupils, """
            [
              {"id": "t01", "name": "Éva néni", "password": "hosszu-tanari-jelszo-1"},
              {"id": "t02", "name": "Béla bácsi", "password": "rovid-7"}
            ]
            """);

        Assert.Equal([new Teacher("t01", "Éva néni")], roster.Teachers);
        Assert.Null(roster.Identify("rovid-7"));
        Assert.Single(roster.Problems);
    }

    [Fact]
    public void SkipsBadPupilEntriesAndReportsThemWithoutPasswords()
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
            """, Teachers);

        Assert.Equal([new Pupil("p01", "Anna")], roster.Pupils);
        Assert.Equal(5, roster.Problems.Count);
        Assert.DoesNotContain(roster.Problems, p => p.Contains("roka") || p.Contains("beka") || p.Contains("x1"));
    }

    [Fact]
    public void SkipsBadTeacherEntriesAndReportsThemWithoutPasswords()
    {
        var roster = Roster.Parse(Pupils, """
            [
              {"id": "t01", "name": "Éva néni", "password": "hosszu-tanari-jelszo-1"},
              {"id": "t02", "name": "Béla bácsi", "password": "HOSSZU tanári jelszó 1"},
              {"id": "t01", "name": "Cili néni", "password": "harmadik-tanari-jelszo"},
              {"id": "t 04", "name": "Dani bácsi", "password": "negyedik-tanari-jelszo"},
              {"id": "t05", "name": "", "password": "otodik-tanari-jelszo"},
              {"id": "t06", "name": "Emma néni", "password": "x1"}
            ]
            """);

        Assert.Equal([new Teacher("t01", "Éva néni")], roster.Teachers);
        Assert.Equal(5, roster.Problems.Count);
        Assert.All(roster.Problems, p => Assert.Contains("tanár", p));
        Assert.DoesNotContain(roster.Problems, p => p.Contains("jelszo") || p.Contains("jelszó 1") || p.Contains("x1"));
    }

    [Fact]
    public void LeavesOutAPupilWhoSharesAPasswordWithATeacher()
    {
        var roster = Roster.Parse("""
            [
              {"id": "p01", "name": "Anna", "password": "Hosszú tanári jelszó 1"},
              {"id": "p02", "name": "Bence", "password": "kek-bagoly-3"}
            ]
            """, Teachers);

        Assert.Equal([new Pupil("p02", "Bence")], roster.Pupils);
        Assert.Equal(Roles.Teacher, roster.Identify("hosszu-tanari-jelszo-1")?.Role);
        Assert.Single(roster.Problems);
        Assert.DoesNotContain(roster.Problems, p => p.Contains("jelszo-1"));
    }

    [Fact]
    public void LeavesOutAPupilWhoSharesAnIdWithATeacher()
    {
        var roster = Roster.Parse("""
            [
              {"id": "T01", "name": "Anna", "password": "piros-roka-7"},
              {"id": "p02", "name": "Bence", "password": "kek-bagoly-3"}
            ]
            """, Teachers);

        Assert.Equal([new Pupil("p02", "Bence")], roster.Pupils);
        Assert.Null(roster.Identify("piros-roka-7"));
        Assert.Single(roster.Problems);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not json")]
    [InlineData("""{"id": "p01"}""")]
    public void ReportsAMissingOrInvalidPupilList(string? json)
    {
        var roster = Roster.Parse(json, Teachers);

        Assert.Empty(roster.Pupils);
        Assert.Single(roster.Problems);
        Assert.Contains("PUPILS_JSON", roster.Problems[0]);
        Assert.NotNull(roster.Identify("hosszu-tanari-jelszo-1"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not json")]
    [InlineData("""{"id": "t01"}""")]
    public void ReportsAMissingOrInvalidTeacherList(string? json)
    {
        var roster = Roster.Parse(Pupils, json);

        Assert.Empty(roster.Teachers);
        Assert.Single(roster.Problems);
        Assert.Contains("TEACHERS_JSON", roster.Problems[0]);
        Assert.Equal(2, roster.Pupils.Count);
    }
}
