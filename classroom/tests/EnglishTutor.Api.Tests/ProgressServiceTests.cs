using System.Text.Json;
using EnglishTutor.Api.Progress;

namespace EnglishTutor.Api.Tests;

public class ProgressServiceTests
{
    private readonly InMemoryProgressStore _store = new();
    private readonly ProgressService _service;

    public ProgressServiceTests() => _service = new ProgressService(_store, TimeProvider.System);

    private static JsonElement State(int xp) => JsonDocument.Parse("{\"player\": {\"xp\": " + xp + "}}").RootElement;

    [Fact]
    public async Task FirstSaveCreatesRevisionOne()
    {
        var result = await _service.SaveAsync("p01", 0, State(10), CancellationToken.None);

        Assert.True(result.Saved);
        Assert.Equal(1, result.Current!.Revision);
        Assert.Equal(10, (await _service.GetAsync("p01", CancellationToken.None))!.Summary.Xp);
    }

    [Fact]
    public async Task EachSaveBasedOnTheLatestRevisionIncrementsIt()
    {
        await _service.SaveAsync("p01", 0, State(10), CancellationToken.None);
        var second = await _service.SaveAsync("p01", 1, State(20), CancellationToken.None);
        var third = await _service.SaveAsync("p01", 2, State(30), CancellationToken.None);

        Assert.Equal((true, 3, 30), (third.Saved, third.Current!.Revision, third.Current.Summary.Xp));
        Assert.True(second.Saved);
    }

    [Fact]
    public async Task StaleSaveFromAnotherDeviceIsRejectedWithTheNewerCopy()
    {
        await _service.SaveAsync("p01", 0, State(10), CancellationToken.None);
        await _service.SaveAsync("p01", 1, State(20), CancellationToken.None); // device A

        var stale = await _service.SaveAsync("p01", 1, State(15), CancellationToken.None); // device B, still on revision 1

        Assert.False(stale.Saved);
        Assert.Equal((2, 20), (stale.Current!.Revision, stale.Current.Summary.Xp));
        Assert.Equal(20, (await _service.GetAsync("p01", CancellationToken.None))!.Summary.Xp);
    }

    [Fact]
    public async Task ConcurrentWriteBetweenReadAndReplaceIsAConflict()
    {
        await _service.SaveAsync("p01", 0, State(10), CancellationToken.None);
        _store.BeforeReplace = () => _store.Put(new ProgressDocument("p01", 2, DateTimeOffset.UtcNow, ProgressSummary.From(State(99)), State(99)));

        var result = await _service.SaveAsync("p01", 1, State(20), CancellationToken.None);

        Assert.False(result.Saved);
        Assert.Equal(99, result.Current!.Summary.Xp);
    }

    [Fact]
    public async Task PupilsHaveSeparateDocuments()
    {
        await _service.SaveAsync("p01", 0, State(10), CancellationToken.None);
        var other = await _service.SaveAsync("p02", 0, State(50), CancellationToken.None);

        Assert.True(other.Saved);
        Assert.Equal(10, (await _service.GetAsync("p01", CancellationToken.None))!.Summary.Xp);
        Assert.Null(await _service.GetAsync("p03", CancellationToken.None));
    }

    private sealed class InMemoryProgressStore : IProgressStore
    {
        private readonly Dictionary<string, StoredProgress> _documents = [];

        public Action? BeforeReplace { get; set; }

        public void Put(ProgressDocument document) => _documents[document.Id] = new StoredProgress(document, Guid.NewGuid().ToString());

        public Task<StoredProgress?> GetAsync(string pupilId, CancellationToken cancellationToken) =>
            Task.FromResult(_documents.GetValueOrDefault(pupilId));

        public Task<bool> TryCreateAsync(ProgressDocument document, CancellationToken cancellationToken)
        {
            if (_documents.ContainsKey(document.Id)) return Task.FromResult(false);
            Put(document);
            return Task.FromResult(true);
        }

        public Task<bool> TryReplaceAsync(ProgressDocument document, string etag, CancellationToken cancellationToken)
        {
            BeforeReplace?.Invoke();
            if (!_documents.TryGetValue(document.Id, out var current) || current.ETag != etag) return Task.FromResult(false);
            Put(document);
            return Task.FromResult(true);
        }
    }
}
