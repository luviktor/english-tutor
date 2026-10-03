using EnglishTutor.Api.Dictionary;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.Services.AddSingleton(new DictionaryProvider(Path.Combine(AppContext.BaseDirectory, "data")));

builder.Build().Run();
