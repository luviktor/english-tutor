using System.Text.Json;

namespace EnglishTutor.Api.Progress;

/// <summary>
/// One pupil's progress: a document in the Cosmos DB container "progress", partition key /id.
/// </summary>
/// <param name="Id">The pupil's id from PUPILS_JSON (not the password, so a new password keeps the progress).</param>
/// <param name="Revision">Grows by one with every save; a save based on an older revision is rejected.</param>
/// <param name="Data">The frontend's state object, stored as it is. Not indexed.</param>
public sealed record ProgressDocument(
    string Id,
    int Revision,
    DateTimeOffset UpdatedAt,
    ProgressSummary Summary,
    JsonElement Data);

/// <summary>The class table's view of a document: everything but the data.</summary>
public sealed record ProgressSummaryRow(string Id, int Revision, DateTimeOffset UpdatedAt, ProgressSummary Summary);

/// <param name="ETag">Changes with every write; used for optimistic concurrency.</param>
public sealed record StoredProgress(ProgressDocument Document, string ETag);
