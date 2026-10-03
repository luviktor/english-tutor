using System.Text;

namespace EnglishTutor.Api.Dictionary;

/// <summary>One data row of a CSV file, with canonical column names and its line number.</summary>
public sealed record CsvRow(int Line, IReadOnlyDictionary<string, string> Fields)
{
    public string Get(string column) => Fields.TryGetValue(column, out var value) ? value : "";
}

/// <summary>
/// Reads the dictionary CSV files as tolerantly as the demo's server.py: UTF-8 or Windows-1250,
/// ';', ',' or tab as the separator, English or Hungarian column names in any letter case,
/// quoted fields, and lines starting with '#' ignored.
/// </summary>
public static class CsvTable
{
    // Column names are accepted in English or Hungarian, in any letter case.
    private static readonly Dictionary<string, string> HeaderAliases = new()
    {
        ["topic"] = "topic", ["tema"] = "topic", ["téma"] = "topic", ["kategoria"] = "topic", ["kategória"] = "topic",
        ["english"] = "english", ["angol"] = "english", ["en"] = "english",
        ["hungarian"] = "hungarian", ["magyar"] = "hungarian", ["hu"] = "hungarian",
        ["emoji"] = "emoji", ["kep"] = "emoji", ["kép"] = "emoji", ["icon"] = "emoji", ["ikon"] = "emoji",
        ["color"] = "color", ["colour"] = "color", ["szin"] = "color", ["szín"] = "color",
    };

    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    static CsvTable() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    /// <summary>Excel on a Hungarian Windows may save CSV as Windows-1250 instead of UTF-8.</summary>
    public static string Decode(byte[] raw)
    {
        var start = raw.AsSpan().StartsWith((ReadOnlySpan<byte>)[0xEF, 0xBB, 0xBF]) ? 3 : 0;
        try
        {
            return StrictUtf8.GetString(raw, start, raw.Length - start);
        }
        catch (DecoderFallbackException)
        {
            return Encoding.GetEncoding(1250).GetString(raw);
        }
    }

    public static IReadOnlyList<CsvRow> ReadFile(string path) =>
        File.Exists(path) ? Parse(Decode(File.ReadAllBytes(path))) : [];

    public static IReadOnlyList<CsvRow> Parse(string text)
    {
        var delimiter = DetectDelimiter(text);
        string[]? header = null;
        var rows = new List<CsvRow>();
        foreach (var (line, cells) in Records(text, delimiter))
        {
            if (cells.All(c => c.Trim().Length == 0) || cells[0].TrimStart().StartsWith('#'))
            {
                continue;
            }
            if (header is null)
            {
                header = cells.Select(c => c.Trim().ToLowerInvariant())
                    .Select(c => HeaderAliases.GetValueOrDefault(c, c))
                    .ToArray();
                continue;
            }
            var fields = new Dictionary<string, string>();
            for (var i = 0; i < Math.Min(header.Length, cells.Count); i++)
            {
                fields[header[i]] = cells[i].Trim();
            }
            rows.Add(new CsvRow(line, fields));
        }
        return rows;
    }

    /// <summary>The most frequent of ';', ',' and tab in the header line; Hungarian Excel uses ';'.</summary>
    private static char DetectDelimiter(string text)
    {
        var headerLine = text.Split(["\r\n", "\n", "\r"], StringSplitOptions.None)
            .FirstOrDefault(l => l.Trim().Length > 0 && !l.TrimStart().StartsWith('#')) ?? "";
        var best = ';';
        foreach (var candidate in new[] { ',', '\t' })
        {
            if (headerLine.Count(c => c == candidate) > headerLine.Count(c => c == best))
            {
                best = candidate;
            }
        }
        return best;
    }

    /// <summary>Splits the text into records; a quoted field may contain separators, quotes ("") and line breaks.</summary>
    private static IEnumerable<(int Line, List<string> Cells)> Records(string text, char delimiter)
    {
        var cells = new List<string>();
        var cell = new StringBuilder();
        var line = 1;
        var inQuotes = false;
        var atCellStart = true;

        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"')
                {
                    cell.Append('"');
                    i++;
                }
                else if (c == '"')
                {
                    inQuotes = false;
                }
                else
                {
                    if (c == '\n') line++;
                    cell.Append(c);
                }
                continue;
            }
            if (c == '"' && atCellStart)
            {
                inQuotes = true;
                atCellStart = false;
            }
            else if (c == delimiter)
            {
                cells.Add(cell.ToString());
                cell.Clear();
                atCellStart = true;
            }
            else if (c is '\r' or '\n')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                cells.Add(cell.ToString());
                yield return (line, cells);
                cells = [];
                cell.Clear();
                atCellStart = true;
                line++;
            }
            else
            {
                cell.Append(c);
                atCellStart = false;
            }
        }
        if (cell.Length > 0 || cells.Count > 0)
        {
            cells.Add(cell.ToString());
            yield return (line, cells);
        }
    }
}
