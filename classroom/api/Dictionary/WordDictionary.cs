namespace EnglishTutor.Api.Dictionary;

/// <param name="Key">Lower-case first English spelling; pupils' progress is keyed by it.</param>
/// <param name="Alts">Every accepted English spelling, the shown one first.</param>
/// <param name="Visual">An emoji, a colour ("color:#ff8800") or an image ("img:cat.png"); empty when the word has no picture.</param>
public sealed record Word(string Key, string Topic, string English, IReadOnlyList<string> Alts, string Hu, string Visual);

public sealed record Topic(string Name, string Emoji, string Color);

/// <summary>The parsed dictionary, in the JSON shape the frontend expects.</summary>
public sealed record WordDictionary(IReadOnlyList<Word> Words, IReadOnlyList<Topic> Topics, IReadOnlyList<string> Warnings)
{
    private static readonly string[] DefaultColors =
    [
        "#ff9f43", "#ff6b9d", "#4dabf7", "#9775fa", "#ff6b6b", "#51cf66",
        "#fcc419", "#22b8cf", "#38d9a9", "#f783ac", "#74c0fc", "#a9e34b",
    ];

    public static WordDictionary Load(string dataDirectory) => Build(
        CsvTable.ReadFile(Path.Combine(dataDirectory, "dictionary.csv")),
        CsvTable.ReadFile(Path.Combine(dataDirectory, "topics.csv")));

    /// <summary>
    /// A port of build_dictionary() in demo/server.py. Bad rows become Hungarian warnings
    /// (shown in the teacher's view) instead of errors.
    /// </summary>
    public static WordDictionary Build(IReadOnlyList<CsvRow> dictionaryRows, IReadOnlyList<CsvRow> topicRows)
    {
        var warnings = new List<string>();
        var words = new List<Word>();
        var seen = new HashSet<string>();

        foreach (var row in dictionaryRows)
        {
            var (topic, english, hungarian) = (row.Get("topic"), row.Get("english"), row.Get("hungarian"));
            var alts = english.Split('|').Select(a => a.Trim()).Where(a => a.Length > 0).ToList();
            if (topic.Length == 0 || alts.Count == 0 || hungarian.Length == 0)
            {
                warnings.Add($"dictionary.csv, {row.Line}. sor: hiányzik a téma, az angol vagy a magyar szó - kihagyva.");
                continue;
            }
            var key = alts[0].ToLowerInvariant();
            if (!seen.Add(key))
            {
                warnings.Add($"dictionary.csv, {row.Line}. sor: a(z) '{alts[0]}' szó már szerepel - kihagyva.");
                continue;
            }
            words.Add(new Word(key, topic, alts[0], alts, hungarian, row.Get("emoji")));
        }

        var withoutPicture = words.Where(w => w.Visual.Length == 0).ToList();
        if (withoutPicture.Count > 0)
        {
            var examples = string.Join(", ", withoutPicture.Take(5).Select(w => w.English));
            warnings.Add($"dictionary.csv: {withoutPicture.Count} szóhoz nincs kép (pl. {examples}) - ezeket szöveges feladatokban gyakorolják.");
        }

        if (words.Count == 0)
        {
            warnings.Add("A szótár üres vagy nem olvasható: data/dictionary.csv");
        }

        // Topics: the order of topics.csv first, then any new topic in the order of its first word.
        var topics = new List<(string Name, string Emoji, string Color)>();
        var known = new HashSet<string>();
        foreach (var row in topicRows)
        {
            var name = row.Get("topic");
            if (name.Length > 0 && known.Add(name))
            {
                topics.Add((name, row.Get("emoji"), row.Get("color")));
            }
        }
        foreach (var word in words)
        {
            if (known.Add(word.Topic))
            {
                topics.Add((word.Topic, "", ""));
            }
        }

        var used = words.Select(w => w.Topic).ToHashSet();
        var result = topics.Where(t => used.Contains(t.Name)).Select((t, i) =>
        {
            var first = words.First(w => w.Topic == t.Name);
            var emoji = t.Emoji.Length > 0 ? t.Emoji
                : first.Visual.Length == 0 || first.Visual.StartsWith("color:") || first.Visual.StartsWith("img:") ? "📚"
                : first.Visual;
            var color = t.Color.Length > 0 ? t.Color : DefaultColors[i % DefaultColors.Length];
            return new Topic(t.Name, emoji, color);
        }).ToList();

        return new WordDictionary(words, result, warnings);
    }
}
