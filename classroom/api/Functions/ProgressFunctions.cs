using System.Net;
using System.Text.Json;
using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Progress;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api.Functions;

/// <summary>
/// GET /api/progress – the signed-in pupil's progress, or 204 if there is none yet.
/// PUT /api/progress {"revision": n, "data": {...}} – saves it; 409 with the newer copy when another
/// device saved since revision n.
/// </summary>
public sealed class ProgressFunctions(Roster roster, ProgressService progress)
{
    /// <summary>The progress is a few KB; anything this big is a bug or abuse.</summary>
    public const int MaxBodyBytes = 256 * 1024;

    public sealed record SaveRequest(int Revision, JsonElement Data);

    public sealed record ProgressResponse(int Revision, DateTimeOffset UpdatedAt, JsonElement Data);

    public sealed record SavedResponse(int Revision, DateTimeOffset UpdatedAt);

    [Function("GetProgress")]
    public async Task<HttpResponseData> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "progress")] HttpRequestData req,
        CancellationToken cancellationToken)
    {
        var (pupil, denied) = await roster.AuthorizeAsync(req, Roles.Pupil);
        if (pupil is null) return denied!;

        var document = await progress.GetAsync(pupil.Id, cancellationToken);
        return document is null
            ? req.Empty(HttpStatusCode.NoContent)
            : await req.Json(new ProgressResponse(document.Revision, document.UpdatedAt, document.Data));
    }

    [Function("SaveProgress")]
    public async Task<HttpResponseData> Save(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "progress")] HttpRequestData req,
        CancellationToken cancellationToken)
    {
        var (pupil, denied) = await roster.AuthorizeAsync(req, Roles.Pupil);
        if (pupil is null) return denied!;

        var body = await ReadLimitedAsync(req.Body, cancellationToken);
        if (body is null)
        {
            return await req.Error(HttpStatusCode.RequestEntityTooLarge, "too large");
        }
        SaveRequest? request;
        try
        {
            request = JsonSerializer.Deserialize<SaveRequest>(body, JsonDefaults.Options);
        }
        catch (JsonException)
        {
            return await req.Error(HttpStatusCode.BadRequest, "bad json");
        }
        if (request is null || request.Revision < 0 || request.Data.ValueKind != JsonValueKind.Object
            || !request.Data.TryGetProperty("player", out var player) || player.ValueKind != JsonValueKind.Object)
        {
            return await req.Error(HttpStatusCode.BadRequest, "not a progress object");
        }

        var result = await progress.SaveAsync(pupil.Id, request.Revision, request.Data, cancellationToken);
        if (result.Saved)
        {
            return await req.Json(new SavedResponse(result.Current!.Revision, result.Current.UpdatedAt));
        }
        return result.Current is { } newer
            ? await req.Json(new ProgressResponse(newer.Revision, newer.UpdatedAt, newer.Data), HttpStatusCode.Conflict)
            : await req.Error(HttpStatusCode.Conflict, "conflict");
    }

    private static async Task<byte[]?> ReadLimitedAsync(Stream body, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await body.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > MaxBodyBytes) return null;
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }
}
