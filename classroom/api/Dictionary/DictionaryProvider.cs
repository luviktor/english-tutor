using System.Security.Cryptography;
using System.Text.Json;
using EnglishTutor.Api.Auth;
using Microsoft.Extensions.Logging;

namespace EnglishTutor.Api.Dictionary;

/// <param name="Json">The body of GET /api/dictionary, UTF-8.</param>
/// <param name="EntryKeys">The ids of the entries in it: the keys pupils' progress is saved under.</param>
public sealed record DictionarySnapshot(byte[] Json, string ETag, IReadOnlySet<string> EntryKeys);

/// <summary>The ids of the entries in the dictionary now.</summary>
public interface ICurrentWords
{
    /// <summary>Null when the dictionary can't be read and there is no earlier copy.</summary>
    Task<IReadOnlySet<string>?> KeysAsync(CancellationToken cancellationToken);
}

/// <summary>
/// The class's dictionary as JSON, built from Cosmos DB. A built copy is reused for 30 seconds per Functions
/// instance, so a busy minute costs one query; a change made through this instance calls <see cref="Invalidate"/>
/// and shows at once. When Cosmos can't be read, the last good copy is served.
/// </summary>
public sealed class DictionaryProvider(IDictionaryStore store, Roster roster, TimeProvider time, ILogger<DictionaryProvider> logger) : ICurrentWords
{
    public static readonly TimeSpan MaxAge = TimeSpan.FromSeconds(30);

    private sealed record Cached(DictionarySnapshot Snapshot, DateTimeOffset ValidUntil, int Generation);

    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private Cached? _cached;
    private int _generation;

    /// <summary>Null when there is no copy yet and Cosmos can't be read.</summary>
    public async Task<DictionarySnapshot?> GetAsync(CancellationToken cancellationToken)
    {
        if (_cached is { } fresh && IsFresh(fresh)) return fresh.Snapshot;

        await _refreshLock.WaitAsync(cancellationToken);
        try
        {
            var cached = _cached;
            // Another request may have refreshed it while this one waited.
            if (cached is not null && IsFresh(cached)) return cached.Snapshot;

            var generation = Volatile.Read(ref _generation);
            try
            {
                var content = await store.ReadAllAsync(cancellationToken);
                var response = DictionaryResponse.Build(content, roster.TeacherName);
                var json = JsonSerializer.SerializeToUtf8Bytes(response, JsonDefaults.Options);
                var snapshot = new DictionarySnapshot(
                    json, $"\"{Convert.ToHexStringLower(SHA256.HashData(json))[..16]}\"", response.Words.Select(w => w.Key).ToHashSet());
                // A change that happened while reading leaves the generation behind, so the next request reads again.
                _cached = new Cached(snapshot, time.GetUtcNow() + MaxAge, generation);
                return snapshot;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogError(e, "Could not load the dictionary");
                if (cached is null) return null;
                // Keep the last good copy, and try again in a while instead of on every request.
                _cached = cached with { ValidUntil = time.GetUtcNow() + MaxAge, Generation = Volatile.Read(ref _generation) };
                return cached.Snapshot;
            }
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    public async Task<IReadOnlySet<string>?> KeysAsync(CancellationToken cancellationToken) =>
        (await GetAsync(cancellationToken))?.EntryKeys;

    /// <summary>Makes the next <see cref="GetAsync"/> read Cosmos again. Call it after changing the dictionary.</summary>
    public void Invalidate() => Interlocked.Increment(ref _generation);

    private bool IsFresh(Cached cached) =>
        cached.Generation == Volatile.Read(ref _generation) && time.GetUtcNow() < cached.ValidUntil;
}
