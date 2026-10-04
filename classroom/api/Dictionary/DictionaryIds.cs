using System.Security.Cryptography;

namespace EnglishTutor.Api.Dictionary;

/// <summary>
/// Generated ids: "e-" or "t-" plus 10 random lower-case letters and digits. English phrases can contain characters
/// Cosmos forbids in ids ("/ \ ? #"), so the text can't be the id.
/// </summary>
public static class DictionaryIds
{
    private const string Alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

    public static string NewEntry() => "e-" + RandomNumberGenerator.GetString(Alphabet, 10);

    public static string NewTopic() => "t-" + RandomNumberGenerator.GetString(Alphabet, 10);
}
