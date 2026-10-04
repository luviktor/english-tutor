using EnglishTutor.Api.Dictionary;

namespace EnglishTutor.Api.Tests;

/// <summary>An <see cref="IDictionaryStore"/> that keeps its documents in memory and behaves like Cosmos: ETags change on every write.</summary>
internal sealed class InMemoryDictionaryStore : IDictionaryStore
{
    private readonly Dictionary<string, StoredDocument<DictionaryDocument>> _documents = [];

    /// <summary>How many times everything was read, failed attempts included.</summary>
    public int Reads { get; private set; }

    /// <summary>While set, every call throws, like an unreachable database.</summary>
    public bool Unavailable { get; set; }

    public void Put(DictionaryDocument document) => _documents[document.Id] = new StoredDocument<DictionaryDocument>(document, Guid.NewGuid().ToString());

    public Task<DictionaryContent> ReadAllAsync(CancellationToken cancellationToken)
    {
        Reads++;
        Check();
        var documents = _documents.Values.Select(s => s.Document).ToList();
        return Task.FromResult(new DictionaryContent(documents.OfType<TopicDocument>().ToList(), documents.OfType<EntryDocument>().ToList()));
    }

    public Task<StoredDocument<T>?> GetAsync<T>(string id, CancellationToken cancellationToken) where T : DictionaryDocument
    {
        Check();
        return Task.FromResult(_documents.TryGetValue(id, out var stored) && stored.Document is T document
            ? new StoredDocument<T>(document, stored.ETag)
            : null);
    }

    public Task<bool> TryCreateAsync(DictionaryDocument document, CancellationToken cancellationToken)
    {
        Check();
        if (_documents.ContainsKey(document.Id)) return Task.FromResult(false);
        Put(document);
        return Task.FromResult(true);
    }

    public Task<bool> TryReplaceAsync(DictionaryDocument document, string etag, CancellationToken cancellationToken)
    {
        Check();
        if (!_documents.TryGetValue(document.Id, out var current) || current.ETag != etag) return Task.FromResult(false);
        Put(document);
        return Task.FromResult(true);
    }

    public Task<bool> TryDeleteAsync(string id, string etag, CancellationToken cancellationToken)
    {
        Check();
        if (!_documents.TryGetValue(id, out var current) || current.ETag != etag) return Task.FromResult(false);
        _documents.Remove(id);
        return Task.FromResult(true);
    }

    private void Check()
    {
        if (Unavailable) throw new InvalidOperationException("Cosmos DB is unavailable");
    }
}
