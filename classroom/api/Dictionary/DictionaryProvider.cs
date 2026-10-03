using System.Security.Cryptography;
using System.Text.Json;

namespace EnglishTutor.Api.Dictionary;

/// <summary>
/// The bundled data/dictionary.csv and data/topics.csv, parsed once per process: the files
/// only change with a new deployment.
/// </summary>
public sealed class DictionaryProvider(string dataDirectory)
{
    private readonly Lazy<(WordDictionary Dictionary, byte[] Json, string ETag)> _loaded = new(() =>
    {
        var dictionary = WordDictionary.Load(dataDirectory);
        var json = JsonSerializer.SerializeToUtf8Bytes(dictionary, JsonDefaults.Options);
        var etag = $"\"{Convert.ToHexStringLower(SHA256.HashData(json))[..16]}\"";
        return (dictionary, json, etag);
    });

    public WordDictionary Dictionary => _loaded.Value.Dictionary;

    /// <summary>The dictionary as UTF-8 JSON.</summary>
    public byte[] Content => _loaded.Value.Json;

    public string ETag => _loaded.Value.ETag;
}
