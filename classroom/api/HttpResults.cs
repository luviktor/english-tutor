using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api;

/// <summary>Small helpers to answer an HTTP request with JSON.</summary>
public static class HttpResults
{
    public static async Task<HttpResponseData> Json<T>(this HttpRequestData req, T payload, HttpStatusCode status = HttpStatusCode.OK)
    {
        var response = req.CreateResponse(status);
        response.Headers.Add("Content-Type", "application/json; charset=utf-8");
        response.Headers.Add("Cache-Control", "no-store");
        await response.Body.WriteAsync(JsonSerializer.SerializeToUtf8Bytes(payload, JsonDefaults.Options));
        return response;
    }

    public static Task<HttpResponseData> Error(this HttpRequestData req, HttpStatusCode status, string error) =>
        req.Json(new { error }, status);

    public static HttpResponseData Empty(this HttpRequestData req, HttpStatusCode status)
    {
        var response = req.CreateResponse(status);
        response.Headers.Add("Cache-Control", "no-store");
        return response;
    }
}
