namespace EnglishTutor.Api.Dictionary;

public enum ChangeStatus
{
    /// <summary>400: a value breaks a rule.</summary>
    Invalid,

    /// <summary>404: the entry or topic is gone.</summary>
    NotFound,

    /// <summary>409: someone else changed it since the revision the change is based on.</summary>
    Stale,

    /// <summary>409: another entry already has one of the spellings.</summary>
    Duplicate,

    /// <summary>409: a topic with entries can't be deleted.</summary>
    TopicNotEmpty,
}

/// <param name="Error">For the teacher, in Hungarian.</param>
/// <param name="Field">The JSON property an <see cref="ChangeStatus.Invalid"/> error is about.</param>
/// <param name="Current">What is stored now (<see cref="ChangeStatus.Stale"/>), or the entry that is in the way (<see cref="ChangeStatus.Duplicate"/>).</param>
public sealed record Problem(ChangeStatus Status, string Error, string? Field = null, object? Current = null);

/// <summary>The result of changing the dictionary: the new value, or what stopped the change.</summary>
public sealed record DictionaryChange<T>
{
    private DictionaryChange(T? value, Problem? problem) => (Value, Problem) = (value, problem);

    public T? Value { get; }

    public Problem? Problem { get; }

    public bool Done => Problem is null;

    public static implicit operator DictionaryChange<T>(T value) => new(value, null);

    public static implicit operator DictionaryChange<T>(Problem problem) => new(default, problem);
}
