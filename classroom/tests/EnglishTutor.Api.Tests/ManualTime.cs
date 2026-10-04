namespace EnglishTutor.Api.Tests;

/// <summary>A clock the test moves by hand.</summary>
internal sealed class ManualTime(DateTimeOffset now) : TimeProvider
{
    private DateTimeOffset _now = now;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
