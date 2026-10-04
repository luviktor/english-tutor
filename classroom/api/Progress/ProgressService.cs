using System.Text.Json;
using System.Text.Json.Nodes;

namespace EnglishTutor.Api.Progress;

/// <param name="Saved">False when the save was based on an old revision.</param>
/// <param name="Current">The document now stored: the new one, or on a conflict the newer one in the database.</param>
public sealed record SaveResult(bool Saved, ProgressDocument? Current);

/// <summary>
/// Reads and saves pupils' progress. A save names the revision it is based on; if another device
/// saved in the meantime, the save is rejected and the caller gets the newer document instead.
/// </summary>
public sealed class ProgressService(IProgressStore store, TimeProvider time)
{
    public async Task<ProgressDocument?> GetAsync(string pupilId, CancellationToken cancellationToken) =>
        (await store.GetAsync(pupilId, cancellationToken))?.Document;

    public async Task<SaveResult> SaveAsync(string pupilId, int baseRevision, JsonElement data, CancellationToken cancellationToken)
    {
        data = WithoutPupilName(data);
        var summary = ProgressSummary.From(data);
        var current = await store.GetAsync(pupilId, cancellationToken);
        if (current is null)
        {
            // First save of this pupil (or the document was deleted): nothing to conflict with.
            var created = new ProgressDocument(pupilId, 1, time.GetUtcNow(), summary, data);
            return await store.TryCreateAsync(created, cancellationToken)
                ? new SaveResult(true, created)
                : await ConflictAsync(pupilId, cancellationToken);
        }
        if (current.Document.Revision != baseRevision)
        {
            return new SaveResult(false, current.Document);
        }
        var next = new ProgressDocument(pupilId, current.Document.Revision + 1, time.GetUtcNow(), summary, data);
        return await store.TryReplaceAsync(next, current.ETag, cancellationToken)
            ? new SaveResult(true, next)
            : await ConflictAsync(pupilId, cancellationToken);
    }

    public Task<IReadOnlyList<ProgressSummaryRow>> ListSummariesAsync(CancellationToken cancellationToken) =>
        store.ListSummariesAsync(cancellationToken);

    /// <summary>
    /// The frontend copies the pupil's name from the login into <c>player.name</c>, and takes it from the
    /// login again after every load, so it never needs to be stored. Dropping it here guarantees that the
    /// database holds no name, whatever the pupils are called in <c>PUPILS_JSON</c>.
    /// </summary>
    private static JsonElement WithoutPupilName(JsonElement data)
    {
        if (data.ValueKind != JsonValueKind.Object
            || !data.TryGetProperty("player", out var player)
            || player.ValueKind != JsonValueKind.Object
            || !player.TryGetProperty("name", out _))
        {
            return data;
        }
        var node = JsonNode.Parse(data.GetRawText())!;
        node["player"]!.AsObject().Remove("name");
        return JsonSerializer.SerializeToElement(node);
    }

    private async Task<SaveResult> ConflictAsync(string pupilId, CancellationToken cancellationToken) =>
        new(false, (await store.GetAsync(pupilId, cancellationToken))?.Document);
}
