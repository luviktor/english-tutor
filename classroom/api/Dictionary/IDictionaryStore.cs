namespace EnglishTutor.Api.Dictionary;

/// <summary>Everything the class has entered.</summary>
public sealed record DictionaryContent(IReadOnlyList<TopicDocument> Topics, IReadOnlyList<EntryDocument> Entries);

/// <param name="ETag">Changes with every write; used for optimistic concurrency.</param>
public sealed record StoredDocument<T>(T Document, string ETag) where T : DictionaryDocument;

public interface IDictionaryStore
{
    /// <summary>Every topic and entry, in one single-partition query.</summary>
    Task<DictionaryContent> ReadAllAsync(CancellationToken cancellationToken);

    /// <summary>Null when there is no document with this id, or it is not a <typeparamref name="T"/>.</summary>
    Task<StoredDocument<T>?> GetAsync<T>(string id, CancellationToken cancellationToken) where T : DictionaryDocument;

    /// <summary>False when a document with this id already exists.</summary>
    Task<bool> TryCreateAsync(DictionaryDocument document, CancellationToken cancellationToken);

    /// <summary>False when the document changed since it was read with <paramref name="etag"/>, or is gone.</summary>
    Task<bool> TryReplaceAsync(DictionaryDocument document, string etag, CancellationToken cancellationToken);

    /// <summary>False when the document changed since it was read with <paramref name="etag"/>, or is already gone.</summary>
    Task<bool> TryDeleteAsync(string id, string etag, CancellationToken cancellationToken);
}
