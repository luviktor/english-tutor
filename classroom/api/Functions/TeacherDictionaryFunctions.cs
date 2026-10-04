using System.Net;
using System.Text.Json;
using System.Web;
using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Dictionary;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace EnglishTutor.Api.Functions;

/// <summary>
/// The teachers' endpoints for the dictionary (docs/teacher-dictionary.md), all behind a teacher's password.
/// Responses carry the entry or topic in the same shape as GET /api/dictionary, so the teacher's page can update
/// its own copy. Errors: 400 { error, field } for a broken rule, 404 for something already deleted, and 409
/// { error, reason, current } when someone else got there first: reason "stale" (current is what is stored now),
/// "duplicate" (current is the entry in the way) or "topic-not-empty".
/// </summary>
public sealed class TeacherDictionaryFunctions(Roster roster, DictionaryService dictionary)
{
    [Function("TeacherEntryAdd")]
    public Task<HttpResponseData> AddEntry(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "teacher/entries")] HttpRequestData req,
        CancellationToken cancellationToken) =>
        WithBody<EntryInput, DictionaryWord>(req, cancellationToken, (teacher, input) => dictionary.AddEntryAsync(teacher.Id, input, cancellationToken), HttpStatusCode.Created);

    [Function("TeacherEntryChange")]
    public Task<HttpResponseData> ChangeEntry(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "teacher/entries/{id}")] HttpRequestData req,
        string id, CancellationToken cancellationToken) =>
        WithBody<EntryInput, DictionaryWord>(req, cancellationToken, (teacher, input) => dictionary.UpdateEntryAsync(teacher.Id, id, input, cancellationToken));

    [Function("TeacherEntryDelete")]
    public Task<HttpResponseData> DeleteEntry(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "teacher/entries/{id}")] HttpRequestData req,
        string id, CancellationToken cancellationToken) =>
        WithRevision(req, cancellationToken, revision => dictionary.DeleteEntryAsync(id, revision, cancellationToken));

    [Function("TeacherTopicAdd")]
    public Task<HttpResponseData> AddTopic(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "teacher/topics")] HttpRequestData req,
        CancellationToken cancellationToken) =>
        WithBody<TopicInput, DictionaryTopic>(req, cancellationToken, (teacher, input) => dictionary.AddTopicAsync(teacher.Id, input, cancellationToken), HttpStatusCode.Created);

    [Function("TeacherTopicChange")]
    public Task<HttpResponseData> ChangeTopic(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "teacher/topics/{id}")] HttpRequestData req,
        string id, CancellationToken cancellationToken) =>
        WithBody<TopicInput, DictionaryTopic>(req, cancellationToken, (teacher, input) => dictionary.UpdateTopicAsync(teacher.Id, id, input, cancellationToken));

    [Function("TeacherTopicDelete")]
    public Task<HttpResponseData> DeleteTopic(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "teacher/topics/{id}")] HttpRequestData req,
        string id, CancellationToken cancellationToken) =>
        WithRevision(req, cancellationToken, revision => dictionary.DeleteTopicAsync(id, revision, cancellationToken));

    [Function("TeacherTopicOrder")]
    public Task<HttpResponseData> SetTopicOrder(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "teacher/topic-order")] HttpRequestData req,
        CancellationToken cancellationToken) =>
        WithBody<TopicOrderInput, IReadOnlyList<DictionaryTopic>>(req, cancellationToken, (teacher, input) => dictionary.SetTopicOrderAsync(teacher.Id, input.Ids, cancellationToken));

    private async Task<HttpResponseData> WithBody<TInput, TResult>(
        HttpRequestData req, CancellationToken cancellationToken, Func<Identity, TInput, Task<DictionaryChange<TResult>>> change,
        HttpStatusCode success = HttpStatusCode.OK) where TInput : class
    {
        var (teacher, denied) = await roster.AuthorizeAsync(req, Roles.Teacher);
        if (teacher is null) return denied!;

        TInput? input;
        try
        {
            input = await JsonSerializer.DeserializeAsync<TInput>(req.Body, JsonDefaults.Options, cancellationToken);
        }
        catch (JsonException)
        {
            input = null;
        }
        if (input is null) return await req.Error(HttpStatusCode.BadRequest, "Hibás kérés: a küldött adat nem értelmezhető.");

        return await RespondAsync(req, await change(teacher, input), success);
    }

    private async Task<HttpResponseData> WithRevision(
        HttpRequestData req, CancellationToken cancellationToken, Func<int, Task<DictionaryChange<bool>>> change)
    {
        var (teacher, denied) = await roster.AuthorizeAsync(req, Roles.Teacher);
        if (teacher is null) return denied!;

        if (!int.TryParse(HttpUtility.ParseQueryString(req.Url.Query)["revision"], out var revision))
        {
            return await req.Error(HttpStatusCode.BadRequest, "Hiányzik a változat száma (?revision=n).");
        }
        return await RespondAsync(req, await change(revision), HttpStatusCode.NoContent);
    }

    private static async Task<HttpResponseData> RespondAsync<T>(HttpRequestData req, DictionaryChange<T> change, HttpStatusCode success)
    {
        if (change.Problem is not { } problem)
        {
            return success == HttpStatusCode.NoContent ? req.Empty(success) : await req.Json(change.Value, success);
        }
        return problem.Status switch
        {
            ChangeStatus.Invalid => await req.Json(new { error = problem.Error, field = problem.Field }, HttpStatusCode.BadRequest),
            ChangeStatus.NotFound => await req.Error(HttpStatusCode.NotFound, problem.Error),
            ChangeStatus.Stale => await req.Json(new { error = problem.Error, reason = "stale", current = problem.Current }, HttpStatusCode.Conflict),
            ChangeStatus.Duplicate => await req.Json(new { error = problem.Error, reason = "duplicate", current = problem.Current }, HttpStatusCode.Conflict),
            ChangeStatus.TopicNotEmpty => await req.Json(new { error = problem.Error, reason = "topic-not-empty" }, HttpStatusCode.Conflict),
            _ => throw new InvalidOperationException($"Unhandled status {problem.Status}"),
        };
    }
}
