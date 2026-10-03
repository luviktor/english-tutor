# EnglishTutor – classroom version

The English-learning game of [`demo/`](../demo/) for a whole class, hosted on Azure for free
(see [`docs/azure-plan.md`](../docs/azure-plan.md)). Pupils see it as **Angol kaland**.

| Folder | What |
|---|---|
| `web/` | Vanilla JS frontend (copied from `demo/web`, restyled) and `staticwebapp.config.json` |
| `api/` | `EnglishTutor.Api`: Azure Functions, C# .NET 10 isolated worker, served by Static Web Apps under `/api` |
| `api/data/` | `dictionary.csv` and `topics.csv`, bundled with the API (same format as in the demo) |
| `tests/` | xUnit tests of the API |

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/dictionary` | The words and topics parsed from `api/data/*.csv`, a C# port of the reader in `demo/server.py`. Cached by browsers for 5 minutes. |

## Run it locally

Tools: .NET SDK 10, Azure Functions Core Tools 4, Node.js and the Static Web Apps CLI (`npm i -g @azure/static-web-apps-cli`).

```bash
cp api/local.settings.example.json api/local.settings.json   # once
swa start englishtutor
```

Run it from this folder, then open `http://localhost:4280`. `swa-cli.config.json` starts the Functions host
(`func start --script-root api`, port 7071) and serves `web/` with `/api` proxied to it. (The SWA CLI would
start Core Tools by itself, but refuses to under Node.js 24.) The preview config `classroom` in
`.claude/launch.json` runs the same from the repository root.

SWA CLI 2.0.10 doesn't know `dotnet-isolated:10.0` yet, so it prints a schema error and ignores
`staticwebapp.config.json` locally (headers, fallback route). Azure accepts the value.

Tests: `dotnet test EnglishTutor.slnx`.

## The dictionary

Edit `api/data/dictionary.csv` (format: [`demo/README.md`](../demo/README.md#the-dictionary--datadictionarycsv)) and
push to `master`; the deployment rebuilds the API. Progress is keyed by the lower-case English word,
so changing a word's English spelling loses its progress.

## Deployment

`.github/workflows/azure-static-web-apps.yml` runs the tests, publishes the API and deploys
`web/` + the API on every push to `master` that touches `classroom/`. One-time Azure setup:
[`infra/README.md`](../infra/README.md).
