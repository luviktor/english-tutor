using System.Net;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api.Auth;

public static class RequestIdentity
{
    /// <summary>Every request after login carries the password; the frontend keeps it in localStorage.</summary>
    public const string PasswordHeader = "X-EnglishTutor-Password";

    public static Identity? Identify(this Roster roster, HttpRequestData req) =>
        req.Headers.TryGetValues(PasswordHeader, out var values) ? roster.Identify(values.FirstOrDefault()) : null;

    /// <summary>The caller when it has <paramref name="role"/>; otherwise the 401 or 403 response to return.</summary>
    public static async Task<(Identity? Identity, HttpResponseData? Denied)> AuthorizeAsync(this Roster roster, HttpRequestData req, string role)
    {
        var identity = roster.Identify(req);
        if (identity is null) return (null, await req.Error(HttpStatusCode.Unauthorized, "wrong password"));
        if (identity.Role != role) return (null, await req.Error(HttpStatusCode.Forbidden, $"{role} only"));
        return (identity, null);
    }
}
