using System.Net;
using EnglishTutor.Api.Dictionary;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api.Functions;

/// <summary>GET /api/dictionary – the words and topics, for anyone. Browsers may cache it for a few minutes.</summary>
public sealed class DictionaryFunction(DictionaryProvider dictionary)
{
    [Function("Dictionary")]
    public async Task<HttpResponseData> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dictionary")] HttpRequestData req)
    {
        if (req.Headers.TryGetValues("If-None-Match", out var tags) && tags.Any(t => t.Contains(dictionary.ETag)))
        {
            return req.CreateResponse(HttpStatusCode.NotModified);
        }
        var response = req.CreateResponse(HttpStatusCode.OK);
        response.Headers.Add("Content-Type", "application/json; charset=utf-8");
        response.Headers.Add("Cache-Control", "public, max-age=300");
        response.Headers.Add("ETag", dictionary.ETag);
        await response.Body.WriteAsync(dictionary.Content);
        return response;
    }
}
