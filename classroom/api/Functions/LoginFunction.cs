using System.Net;
using System.Text.Json;
using EnglishTutor.Api.Auth;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api.Functions;

/// <summary>POST /api/login {"password": "..."} – who the password belongs to: { id, name, role }, or 401.</summary>
public sealed class LoginFunction(Roster roster)
{
    private static readonly TimeSpan WrongPasswordDelay = TimeSpan.FromMilliseconds(600);

    public sealed record LoginRequest(string? Password);

    [Function("Login")]
    public async Task<HttpResponseData> Login(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "login")] HttpRequestData req,
        CancellationToken cancellationToken)
    {
        LoginRequest? body = null;
        try
        {
            body = await JsonSerializer.DeserializeAsync<LoginRequest>(req.Body, JsonDefaults.Options, cancellationToken);
        }
        catch (JsonException)
        {
            return await req.Error(HttpStatusCode.BadRequest, "bad json");
        }

        var identity = roster.Identify(body?.Password);
        if (identity is null)
        {
            // Slows down guessing a little; children's passwords are short.
            await Task.Delay(WrongPasswordDelay, cancellationToken);
            return await req.Error(HttpStatusCode.Unauthorized, "wrong password");
        }
        return await req.Json(identity);
    }
}
