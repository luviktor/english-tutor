using EnglishTutor.Api.Auth;

namespace EnglishTutor.Api.Progress;

/// <param name="Summary">Null when the pupil has not played yet.</param>
public sealed record ClassPupil(string Id, string Name, int? Revision, DateTimeOffset? UpdatedAt, ProgressSummary? Summary);

/// <summary>The teacher's class table: every pupil of the roster with their latest summary.</summary>
/// <param name="Problems">Mistakes in PUPILS_JSON / TEACHER_PASSWORD, without passwords.</param>
public sealed record ClassReport(IReadOnlyList<ClassPupil> Pupils, IReadOnlyList<string> Problems)
{
    /// <summary>Pupils in roster order; documents of pupils no longer in the roster are left out.</summary>
    public static ClassReport Build(Roster roster, IEnumerable<ProgressSummaryRow> rows)
    {
        var byId = rows.ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);
        var pupils = roster.Pupils
            .Select(p => byId.TryGetValue(p.Id, out var row)
                ? new ClassPupil(p.Id, p.Name, row.Revision, row.UpdatedAt, row.Summary)
                : new ClassPupil(p.Id, p.Name, null, null, null))
            .ToList();
        return new ClassReport(pupils, roster.Problems);
    }
}
