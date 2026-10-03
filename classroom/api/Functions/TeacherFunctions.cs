using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Progress;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api.Functions;

/// <summary>GET /api/teacher/class – every pupil with XP, words per level, streak and last activity.</summary>
public sealed class TeacherFunctions(Roster roster, ProgressService progress)
{
    [Function("TeacherClass")]
    public async Task<HttpResponseData> Class(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "teacher/class")] HttpRequestData req,
        CancellationToken cancellationToken)
    {
        var (teacher, denied) = await roster.AuthorizeAsync(req, Roles.Teacher);
        if (teacher is null) return denied!;

        var rows = await progress.ListSummariesAsync(cancellationToken);
        return await req.Json(ClassReport.Build(roster, rows));
    }
}
