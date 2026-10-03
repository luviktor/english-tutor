using System.Text.Json;

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

    private async Task<SaveResult> ConflictAsync(string pupilId, CancellationToken cancellationToken) =>
        new(false, (await store.GetAsync(pupilId, cancellationToken))?.Document);
}
