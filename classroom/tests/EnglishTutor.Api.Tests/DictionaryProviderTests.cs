using System.Text.Json;
using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Dictionary;
using Microsoft.Extensions.Logging.Abstractions;

namespace EnglishTutor.Api.Tests;

public class DictionaryProviderTests
{
    private static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-10-04T08:00:00Z");

    private readonly InMemoryDictionaryStore _store = new();
    private readonly ManualTime _time = new(Start);
    private readonly DictionaryProvider _provider;

    public DictionaryProviderTests()
    {
        var roster = Roster.Parse("[]", """[{"id": "t01", "name": "Éva néni", "password": "hosszu-tanari-jelszo-1"}]""");
        _provider = new DictionaryProvider(_store, roster, _time, NullLogger<DictionaryProvider>.Instance);
        _store.Put(new TopicDocument("t-a", 1, "Köszönések", "👋", "#74c0fc", 1, "t01", Start));
        _store.Put(Entry("e-1", "hello"));
    }

    private static EntryDocument Entry(string id, string english) =>
        new(id, 1, EntryKind.Word, "t-a", english, [], "szia", "", "👋", "t01", Start);

    private static string[] Words(DictionarySnapshot snapshot) =>
        JsonDocument.Parse(snapshot.Json).RootElement.GetProperty("words").EnumerateArray()
            .Select(w => w.GetProperty("english").GetString()!).ToArray();

    [Fact]
    public async Task BuildsTheDictionaryFromTheStoreWithTeacherNames()
    {
        var snapshot = await _provider.GetAsync(CancellationToken.None);

        Assert.Equal(["hello"], Words(snapshot!));
        using var json = JsonDocument.Parse(snapshot!.Json);
        Assert.Equal("Éva néni", json.RootElement.GetProperty("topics")[0].GetProperty("updatedBy").GetString());
    }

    [Fact]
    public async Task ReadsTheStoreOnlyOncePer30Seconds()
    {
        var first = await _provider.GetAsync(CancellationToken.None);
        _store.Put(Entry("e-2", "goodbye"));

        _time.Advance(TimeSpan.FromSeconds(29));
        var cached = await _provider.GetAsync(CancellationToken.None);
        _time.Advance(TimeSpan.FromSeconds(2));
        var refreshed = await _provider.GetAsync(CancellationToken.None);

        Assert.Same(first, cached);
        Assert.Equal(["goodbye", "hello"], Words(refreshed!));
        Assert.Equal(2, _store.Reads);
    }

    [Fact]
    public async Task AChangeMadeThroughThisInstanceShowsAtOnce()
    {
        await _provider.GetAsync(CancellationToken.None);
        _store.Put(Entry("e-2", "goodbye"));

        _provider.Invalidate();

        Assert.Equal(["goodbye", "hello"], Words((await _provider.GetAsync(CancellationToken.None))!));
    }

    [Fact]
    public async Task TheETagStaysTheSameUntilTheContentChanges()
    {
        var first = await _provider.GetAsync(CancellationToken.None);
        _time.Advance(TimeSpan.FromMinutes(1));
        var unchanged = await _provider.GetAsync(CancellationToken.None);
        _store.Put(Entry("e-2", "goodbye"));
        _time.Advance(TimeSpan.FromMinutes(1));
        var changed = await _provider.GetAsync(CancellationToken.None);

        Assert.Equal(first!.ETag, unchanged!.ETag);
        Assert.NotEqual(first.ETag, changed!.ETag);
        Assert.Matches("^\"[0-9a-f]{16}\"$", first.ETag);
    }

    [Fact]
    public async Task ServesTheLastGoodCopyWhenCosmosFailsAndTriesAgainLater()
    {
        var good = await _provider.GetAsync(CancellationToken.None);
        _store.Put(Entry("e-2", "goodbye"));
        _store.Unavailable = true;

        _time.Advance(TimeSpan.FromSeconds(31));
        var duringOutage = await _provider.GetAsync(CancellationToken.None);
        var readsAfterFailure = _store.Reads;
        _time.Advance(TimeSpan.FromSeconds(10));
        var stillOut = await _provider.GetAsync(CancellationToken.None);
        var readsWhileWaiting = _store.Reads;
        _store.Unavailable = false;
        _time.Advance(TimeSpan.FromSeconds(21));
        var recovered = await _provider.GetAsync(CancellationToken.None);

        Assert.Same(good, duringOutage);
        Assert.Same(good, stillOut);
        Assert.Equal(2, readsAfterFailure); // the first read and the failed one
        Assert.Equal(readsAfterFailure, readsWhileWaiting); // no new attempt on every request
        Assert.Equal(["goodbye", "hello"], Words(recovered!));
    }

    [Fact]
    public async Task ListsTheIdsOfTheEntriesItServes()
    {
        Assert.Equal(["e-1"], await _provider.KeysAsync(CancellationToken.None));

        _store.Unavailable = true;
        _provider.Invalidate();
        _time.Advance(TimeSpan.FromMinutes(1));
        Assert.Equal(["e-1"], await _provider.KeysAsync(CancellationToken.None)); // the last good copy

        var empty = new DictionaryProvider(_store, Roster.Parse("[]", "[]"), _time, NullLogger<DictionaryProvider>.Instance);
        Assert.Null(await empty.KeysAsync(CancellationToken.None)); // nothing to go on
    }

    [Fact]
    public async Task HasNothingToServeWhenCosmosFailsBeforeTheFirstSuccess()
    {
        _store.Unavailable = true;

        Assert.Null(await _provider.GetAsync(CancellationToken.None));

        _store.Unavailable = false;
        Assert.Equal(["hello"], Words((await _provider.GetAsync(CancellationToken.None))!));
    }
}
