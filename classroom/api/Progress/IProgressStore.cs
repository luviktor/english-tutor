namespace EnglishTutor.Api.Progress;

public interface IProgressStore
{
    Task<StoredProgress?> GetAsync(string pupilId, CancellationToken cancellationToken);

    /// <summary>False when the pupil already has a document.</summary>
    Task<bool> TryCreateAsync(ProgressDocument document, CancellationToken cancellationToken);

    /// <summary>False when the document changed since it was read with <paramref name="etag"/>.</summary>
    Task<bool> TryReplaceAsync(ProgressDocument document, string etag, CancellationToken cancellationToken);

    /// <summary>Every pupil's summary, without the (bigger) data.</summary>
    Task<IReadOnlyList<ProgressSummaryRow>> ListSummariesAsync(CancellationToken cancellationToken);
}
