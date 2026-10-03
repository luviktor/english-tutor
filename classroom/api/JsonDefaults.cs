using System.Text.Encodings.Web;
using System.Text.Json;

namespace EnglishTutor.Api;

/// <summary>JSON settings shared by every endpoint: camelCase names, readable Hungarian text.</summary>
public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
