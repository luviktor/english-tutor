using EnglishTutor.Api;
using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Dictionary;
using EnglishTutor.Api.Progress;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = FunctionsApplication.CreateBuilder(args);
var config = builder.Configuration;
var isDevelopment = builder.Environment.IsDevelopment();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(services =>
{
    var roster = Roster.Parse(config["PUPILS_JSON"], config["TEACHERS_JSON"]);
    var logger = services.GetRequiredService<ILogger<Roster>>();
    foreach (var problem in roster.Problems)
    {
        logger.LogWarning("Roster: {Problem}", problem);
    }
    return roster;
});

builder.Services.AddSingleton(_ =>
{
    var connectionString = config["COSMOS_CONNECTION_STRING"];
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        throw new InvalidOperationException("The COSMOS_CONNECTION_STRING setting is missing.");
    }
    var options = new CosmosClientOptions
    {
        ApplicationName = "EnglishTutor",
        // HTTPS on port 443 only; plenty fast for a class, and no surprises with outbound ports.
        ConnectionMode = ConnectionMode.Gateway,
        UseSystemTextJsonSerializerWithOptions = JsonDefaults.Options,
    };
    if (isDevelopment && IsLocalEmulator(connectionString))
    {
        // The emulator in Docker has a self-signed certificate and reports endpoints only reachable inside it.
        options.LimitToEndpoint = true;
        options.HttpClientFactory = () => new HttpClient(new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
        });
    }
    return new CosmosClient(connectionString, options);
});
builder.Services.AddSingleton<IProgressStore>(services => new CosmosProgressStore(
    services.GetRequiredService<CosmosClient>(),
    createIfMissing: isDevelopment && IsLocalEmulator(config["COSMOS_CONNECTION_STRING"])));
builder.Services.AddSingleton<ProgressService>();
builder.Services.AddSingleton<IDictionaryStore>(services => new CosmosDictionaryStore(
    services.GetRequiredService<CosmosClient>(),
    createIfMissing: isDevelopment && IsLocalEmulator(config["COSMOS_CONNECTION_STRING"])));
builder.Services.AddSingleton<DictionaryProvider>();
builder.Services.AddSingleton<DictionaryService>();

builder.Build().Run();

static bool IsLocalEmulator(string? connectionString)
{
    var endpoint = connectionString?.Split(';')
        .Select(part => part.Split('=', 2))
        .FirstOrDefault(kv => kv[0].Trim().Equals("AccountEndpoint", StringComparison.OrdinalIgnoreCase))?[1];
    return Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) && uri.IsLoopback;
}
