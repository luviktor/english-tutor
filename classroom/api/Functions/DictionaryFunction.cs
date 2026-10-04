using System.Net;
using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Dictionary;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api.Functions;

/// <summary>
/// GET /api/dictionary – the class's topics and words, for any pupil or teacher. Browsers keep a copy but ask
/// every time (<c>private, no-cache</c>) and get 304 when nothing changed, so new words show at the next app load.
/// </summary>
public sealed class DictionaryFunction(Roster roster, DictionaryProvider dictionary)
{
    [Function("Dictionary")]
    public async Task<HttpResponseData> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dictionary")] HttpRequestData req,
        CancellationToken cancellationToken)
    {
        var (caller, denied) = await roster.AuthenticateAsync(req);
        if (caller is null) return denied!;

        var snapshot = await dictionary.GetAsync(cancellationToken);
        if (snapshot is null) return await req.Error(HttpStatusCode.ServiceUnavailable, "dictionary unavailable");

        var notModified = req.Headers.TryGetValues("If-None-Match", out var tags) && tags.Any(t => t.Contains(snapshot.ETag));
        var response = req.CreateResponse(notModified ? HttpStatusCode.NotModified : HttpStatusCode.OK);
        response.Headers.Add("Cache-Control", "private, no-cache");
        response.Headers.Add("ETag", snapshot.ETag);
        if (!notModified)
        {
            response.Headers.Add("Content-Type", "application/json; charset=utf-8");
            await response.Body.WriteAsync(snapshot.Json, cancellationToken);
        }
        return response;
    }
}
