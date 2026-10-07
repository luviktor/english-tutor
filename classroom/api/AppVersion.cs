using System.Reflection;

namespace EnglishTutor.Api;

/// <summary>The release of the classroom app, "x.y.z": the &lt;Version&gt; in EnglishTutor.Api.csproj.</summary>
public static class AppVersion
{
    public static string Current { get; } = Read(typeof(AppVersion).Assembly);

    private static string Read(Assembly assembly) =>
        assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? assembly.GetName().Version?.ToString(3)
        ?? "0.0.0";
}
