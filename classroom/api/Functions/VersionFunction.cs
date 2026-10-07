using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api.Functions;

/// <summary>GET /api/version – { "version": "x.y.z" }, the deployed release. Anonymous: the login screen shows it.</summary>
public sealed class VersionFunction
{
    [Function("Version")]
    public Task<HttpResponseData> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "version")] HttpRequestData req) =>
        req.Json(new { version = AppVersion.Current });
}
