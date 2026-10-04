using System.Text.Json.Serialization;

namespace EnglishTutor.Api.Dictionary;

/// <summary>
/// A document of the Cosmos DB container "dictionary", partition key /classId. The class's whole dictionary
/// is one logical partition, so entries and topics are read together; the "type" property tells them apart.
/// </summary>
/// <param name="Id">Generated once and never changed; for entries it is also the key pupils' progress is saved under.</param>
/// <param name="Revision">Grows by one with every change; a change based on an older revision is rejected.</param>
/// <param name="UpdatedBy">The id of the teacher who made the last change (from TEACHERS_JSON).</param>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(EntryDocument), "entry")]
[JsonDerivedType(typeof(TopicDocument), "topic")]
public abstract record DictionaryDocument(string Id, int Revision, string UpdatedBy, DateTimeOffset UpdatedAt)
{
    /// <summary>There is one class; if there are ever more, each gets its own partition in the same container.</summary>
    public const string Class = "class";

    public string ClassId => Class;
}

[JsonConverter(typeof(JsonStringEnumConverter<EntryKind>))]
public enum EntryKind
{
    [JsonStringEnumMemberName("word")] Word,
    [JsonStringEnumMemberName("phrase")] Phrase,
}

/// <summary>A word or phrase the pupils practise.</summary>
/// <param name="TopicId">The id of the topic it belongs to.</param>
/// <param name="English">The spelling that is shown and spoken.</param>
/// <param name="AlsoAccepted">Other spellings the typing game accepts, e.g. "thanks" next to "thank you".</param>
/// <param name="Note">A short Hungarian hint on when it is used; empty for none.</param>
/// <param name="Visual">An emoji, "color:#rrggbb", or empty for no picture.</param>
public sealed record EntryDocument(
    string Id,
    int Revision,
    EntryKind Kind,
    string TopicId,
    string English,
    IReadOnlyList<string> AlsoAccepted,
    string Hu,
    string Note,
    string Visual,
    string UpdatedBy,
    DateTimeOffset UpdatedAt) : DictionaryDocument(Id, Revision, UpdatedBy, UpdatedAt);

/// <param name="Order">Where the topic is in the list; the entries refer to topics by id, so renaming is a single write.</param>
public sealed record TopicDocument(
    string Id,
    int Revision,
    string Name,
    string Emoji,
    string Color,
    int Order,
    string UpdatedBy,
    DateTimeOffset UpdatedAt) : DictionaryDocument(Id, Revision, UpdatedBy, UpdatedAt);
