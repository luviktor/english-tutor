using EnglishTutor.Api.Auth;
using EnglishTutor.Api.Dictionary;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = FunctionsApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.Services.AddSingleton(new DictionaryProvider(Path.Combine(AppContext.BaseDirectory, "data")));

builder.Services.AddSingleton(services =>
{
    var roster = Roster.Parse(config["PUPILS_JSON"], config["TEACHER_PASSWORD"]);
    var logger = services.GetRequiredService<ILogger<Roster>>();
    foreach (var problem in roster.Problems)
    {
        logger.LogWarning("Roster: {Problem}", problem);
    }
    return roster;
});

builder.Build().Run();
