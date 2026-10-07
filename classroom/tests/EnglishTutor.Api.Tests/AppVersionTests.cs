using System.Text.RegularExpressions;

namespace EnglishTutor.Api.Tests;

public class AppVersionTests
{
    [Fact]
    public void IsPlainMajorMinorPatch()
    {
        // No pre-release suffix and no build metadata (such as the commit hash the SDK would append): the frontend shows it as is.
        Assert.Matches(new Regex(@"^\d+\.\d+\.\d+$"), AppVersion.Current);
    }
}
