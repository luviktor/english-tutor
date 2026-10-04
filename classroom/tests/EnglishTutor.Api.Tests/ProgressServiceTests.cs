using System.Text.Json;
using EnglishTutor.Api.Dictionary;
using EnglishTutor.Api.Progress;

namespace EnglishTutor.Api.Tests;

public class ProgressServiceTests
{
    private readonly InMemoryProgressStore _store = new();
    private readonly FakeCurrentWords _words = new();
    private readonly ProgressService _service;

    public ProgressServiceTests() => _service = new ProgressService(_store, _words, TimeProvider.System);

    private static JsonElement State(int xp) => JsonDocument.Parse("{\"player\": {\"xp\": " + xp + "}}").RootElement;

    private static JsonElement StateWithWords(params (string Key, int Level)[] words) =>
        JsonDocument.Parse("{\"player\": {\"xp\": 1}, \"words\": {" + string.Join(",", words.Select(w => $"\"{w.Key}\": {{\"lvl\": {w.Level}}}")) + "}}").RootElement;

    [Fact]
    public async Task TheSummaryCountsOnlyWordsThatAreStillInTheDictionary()
    {
        _words.Keys = new HashSet<string> { "e-1", "e-2" };

        var result = await _service.SaveAsync("p01", 0, StateWithWords(("e-1", 5), ("e-2", 0), ("e-deleted", 5)), CancellationToken.None);

        Assert.Equal([1, 0, 0, 0, 0, 1], result.Current!.Summary.WordsByLevel); // one at level 0 and one gold; the deleted gold word is not counted
    }

    [Fact]
    public async Task TheDeletedWordsStayInTheSavedProgressThough()
    {
        _words.Keys = new HashSet<string> { "e-1" };

        var result = await _service.SaveAsync("p01", 0, StateWithWords(("e-1", 3), ("e-deleted", 4)), CancellationToken.None);

        Assert.Equal(1, result.Current!.Summary.WordsByLevel.Sum());
        Assert.True(result.Current.Data.GetProperty("words").TryGetProperty("e-deleted", out _));
    }

    [Fact]
    public async Task CountsEveryWordWhenTheDictionaryCannotBeRead()
    {
        _words.Keys = null;

        var result = await _service.SaveAsync("p01", 0, StateWithWords(("e-1", 3), ("e-deleted", 4)), CancellationToken.None);

        Assert.Equal(2, result.Current!.Summary.WordsByLevel.Sum());
    }

    private sealed class FakeCurrentWords : ICurrentWords
    {
        /// <summary>Null means the dictionary can't be read.</summary>
        public IReadOnlySet<string>? Keys { get; set; }

        public Task<IReadOnlySet<string>?> KeysAsync(CancellationToken cancellationToken) => Task.FromResult(Keys);
    }

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
    public async Task ThePupilsNameIsNotStored()
    {
        var withName = JsonDocument.Parse("{\"player\": {\"name\": \"Anna\", \"xp\": 10}, \"stars\": 1}").RootElement;

        var result = await _service.SaveAsync("p01", 0, withName, CancellationToken.None);

        Assert.True(result.Saved);
        var stored = (await _service.GetAsync("p01", CancellationToken.None))!;
        Assert.DoesNotContain("Anna", stored.Data.GetRawText());
        Assert.False(stored.Data.GetProperty("player").TryGetProperty("name", out _));
        Assert.Equal(10, stored.Data.GetProperty("player").GetProperty("xp").GetInt32());
        Assert.Equal(1, stored.Data.GetProperty("stars").GetInt32());
        Assert.Equal(10, stored.Summary.Xp);
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

        public Task<IReadOnlyList<ProgressSummaryRow>> ListSummariesAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<ProgressSummaryRow>>(_documents.Values
                .Select(s => new ProgressSummaryRow(s.Document.Id, s.Document.Revision, s.Document.UpdatedAt, s.Document.Summary))
                .ToList());
    }
}
