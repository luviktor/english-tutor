# EnglishTutor on Azure – plan

The demo in `demo/` was accepted by the teachers. This plan moves the app to Azure so that a whole class can use it, free of charge.

## Requirements

- About 25 pupils, each playing at most 30 minutes a day.
- **€0 per month**: only always-free Azure tiers.
- Storage for the pupils' results.
- A backend that keeps secrets and talks to the frontend.
- Later, not in the first phase: the teacher uploads pictures to fill the dictionary.

Naming: the application is called **EnglishTutor** in every project, resource and identifier.

## Architecture

```
  Pupil's / teacher's browser (vanilla JS frontend)
        │  same origin, header X-EnglishTutor-Password
        ▼
 ┌──────────── Azure Static Web Apps – Free plan ────────────┐
 │ static frontend, globally distributed                     │
 │ /api/*  managed Azure Functions, C# .NET 10 isolated      │
 │ environment variables (encrypted): connection string,     │
 │ pupil list, teacher password                              │
 └──────────────────────────┬────────────────────────────────┘
                            ▼
              Azure Cosmos DB for NoSQL – free tier
              database "englishtutor", container "progress"

  (later) Blob Storage for the teacher's pictures, read by the browser directly
```

| Need | Service | Free allowance | Expected use |
|---|---|---|---|
| Frontend + backend | Static Web Apps Free with managed Functions (`apiRuntime: dotnet-isolated:10.0`) | 100 GB/month bandwidth. Overage isn't available, so it can't be billed. No CPU quota. | About 1 GB/month |
| Secrets | Static Web Apps environment variables | Encrypted at rest, separate per environment, readable only by the API | 3 values |
| Pupil results | Cosmos DB free tier | 1000 RU/s and 25 GB for the lifetime of the account; one free account per subscription | Peak around 100–300 RU/s (to be measured) and under 1 MB of data |
| Pictures (later) | Blob Storage, LRS, Hot | Not always free; costs fractions of a cent at this size | Tens of MB |

Sources: [SWA runtimes](https://learn.microsoft.com/azure/static-web-apps/languages-runtimes), [SWA quotas](https://learn.microsoft.com/azure/static-web-apps/quotas), [SWA API constraints](https://learn.microsoft.com/azure/static-web-apps/apis-functions), [Cosmos DB free tier](https://learn.microsoft.com/azure/cosmos-db/free-tier).

Limits of managed Functions to keep in mind:
- HTTP triggers only.
- 45 s maximum per request, 30 MB maximum request size.
- No managed identity and no Key Vault references, so the Cosmos connection string is stored as a secret.
- Cold start: the first request after an idle period takes a few seconds.

## Secrets (environment variables)

| Name | Content |
|---|---|
| `COSMOS_CONNECTION_STRING` | Connection string of the Cosmos DB account |
| `PUPILS_JSON` | `[{"id":"p01","name":"Anna","password":"piros-roka-7"}, ...]` (example values) |
| `TEACHER_PASSWORD` | A long password; the teacher sees the whole class |

Locally, the same values go in `classroom/api/local.settings.json`, which is gitignored. **The GitHub repository is public, so passwords are never committed.**

## Login

Simple passwords kept in the backend; no accounts, no email addresses.

- **Pupils:**
  - Each pupil types only their own unique password, which identifies them. No public list of names is shown.
  - Passwords are kid-friendly and have no accents: colour–animal–number, for example `piros-roka-7`. They are compared ignoring case and surrounding spaces.
  - `POST /api/login` returns the pupil's id and name. The frontend keeps the password in localStorage and sends it in the `X-EnglishTutor-Password` header with every request, so a child types it once per device.
  - Changing a password in `PUPILS_JSON` logs out old devices automatically.
- **Progress is keyed by the pupil id, not the password**, so a password change keeps the progress.
- **Teacher:** the same mechanism with `TEACHER_PASSWORD`, which gives the `teacher` role.
- **Accepted risk:** someone who learns or guesses a pupil's password can see or change that child's XP.

## Data model (Cosmos DB)

- Database `englishtutor` with 1000 RU/s shared by its containers. On the account, turn on **"limit total account throughput" = 1000**, which makes throughput charges impossible.
- Container `progress`, partition key `/id`, one document per pupil:
  - `id`: the pupil id.
  - `data`: the current `state.js` object, unchanged.
  - `summary`: XP, words per level, streak and last active. It is computed on every save and feeds the teacher view.
  - `updatedAt` and a revision number: a stale save from a second device gets `409 Conflict`.
- The `data` field is excluded from indexing, which makes writes cheaper.

## API

All endpoints are under `/api` on the same origin as the frontend, so CORS isn't needed.

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/dictionary` | anyone | Parses the bundled `dictionary.csv` and `topics.csv`, a C# port of the reader in `demo/server.py`. The browser may cache it. |
| `POST /api/login` | anyone | Checks a password; returns `{ id, name, role }` |
| `GET /api/progress` | pupil | Their progress, or `204` if they have none yet |
| `PUT /api/progress` | pupil | Saves progress and recomputes the summary; returns `409` on a stale revision |
| `GET /api/teacher/class` | teacher | Every pupil with their summary |
| (later) picture upload and list | teacher / pupil | Teacher uploads to Blob; pupils get picture URLs per word |

## Frontend changes

The frontend is copied from `demo/web`; the demo stays untouched.

- `api.js`: drop the localStorage fallback and the automatic mode detection. Send the password header, and save with `PUT /api/progress`.
- `state.js`: today it saves 500 ms after every change. Change that to at most every ~5 s, plus at the end of each round and when the page is hidden.
  - Keep a local copy and retry failed saves, so flaky Wi-Fi doesn't lose progress.
  - The save on page close has a 64 KB body limit. Progress is 4.4 KB today and should stay well below the limit at ~200 words.
- New screens: login, and the teacher's class table.
- Rename identifiers to EnglishTutor, for example the localStorage keys.
- The visible Hungarian title "Nóra angol kalandja" needs a class-wide replacement (open question below).

## Repository layout

```
demo/                      unchanged; still deployed to GitHub Pages
classroom/
  EnglishTutor.slnx
  web/                     frontend + staticwebapp.config.json (apiRuntime, routes)
  api/                     EnglishTutor.Api – Azure Functions, .NET 10 isolated
    EnglishTutor.Api.csproj
    Program.cs, host.json
    local.settings.json    gitignored, local secrets
    data/                  dictionary.csv, topics.csv
  swa-cli.config.json      folders for `swa start`
infra/
  main.bicep               SWA Free, Cosmos free tier (database + container)
.github/workflows/
  azure-static-web-apps.yml
docs/azure-plan.md         this file
```

## Local development

**Tools** (checked on 2026-10-03):

| Tool | Version | What it's for |
|---|---|---|
| .NET SDK | 10.0.401 | Builds and runs the API |
| Azure Functions Core Tools | 4.15.2 | Functions host on port 7071 |
| Node.js / npm | 24.19.0 / 12.2.0 | Needed only by the SWA CLI |
| Static Web Apps CLI (`swa`) | 2.0.10 | Serves the frontend and `/api` together on `localhost:4280` with the Azure routing rules |
| Docker | 29.7.2 | Runs the Cosmos DB emulator |
| Azure CLI | 2.90.0 | Deploys the infrastructure; Bicep is downloaded on first use (`az bicep install`) |

**Daily routine:**

1. Start the Cosmos DB emulator. HTTPS mode is required because the .NET SDK doesn't support the emulator's HTTP mode. In Development only, the client uses Gateway mode and accepts the emulator's self-signed certificate. The data explorer is at `http://localhost:1234`.

   ```bash
   docker run --detach --publish 8081:8081 --publish 8080:8080 --publish 1234:1234 mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-latest --protocol https
   ```
2. Run `swa start` from `classroom/`. It also starts Core Tools. To debug the API in an IDE instead, start it there and point the SWA CLI at `http://localhost:7071`.
3. Open `http://localhost:4280`. A `.claude/launch.json` entry will run the same thing.

Alternative without the emulator: point `local.settings.json` at a separate dev container in the free Cosmos account. That needs internet and shares the 1000 RU/s.

## Keeping it at €0

- **Cosmos DB:** free tier plus the 1000 RU/s account limit.
- **Static Web Apps Free:** bandwidth overage can't be billed.
- **Don't create** Key Vault, App Service plans, Container Registry or Front Door.
- **Application Insights (optional):** if enabled, set a daily cap (Log Analytics includes 5 GB/month free).
- **Budget alert:** €1/month in Cost Management. It only sends alerts, with some delay; it stops nothing.
- **Subscription:** an Azure free account gives $200 credit for 30 days and is then **disabled unless upgraded to pay-as-you-go**. After the upgrade, the always-free tiers above stay at €0.
- **Cosmos free tier:** there's only one per subscription, so don't use it up on experiments.
- **Preview deployments:** environment variables are copied to pull-request preview environments, so a preview would talk to the production database. Deploy only from `master` at first.

## Phases

Each phase gets its own `feature/<topic>` branch with small commits.

0. **Setup.**
   - You: create the subscription and upgrade it to pay-as-you-go before day 30. Create the resource group `rg-englishtutor` in West Europe and the €1 budget alert.
   - Claude: `infra/main.bicep` (Static Web App `swa-englishtutor`, Cosmos account `cosmos-englishtutor-<suffix>` with free tier and the throughput limit, database, container) and the deployment steps.
1. **Skeleton.**
   - Add `classroom/` with the copied frontend, `EnglishTutor.Api`, `GET /api/dictionary`, the SWA workflow and the local `swa start` setup.
   - Result: the app runs on `*.azurestaticapps.net` and still keeps progress in the browser.
2. **Pupil login and progress in Cosmos DB.**
   - Login endpoint and screen, progress endpoints, the save throttle and retry, and the conflict check.
   - Import Nóra's existing `demo/data/progress.json` as one pupil.
3. **Teacher view.** Teacher login and a class table with XP, words per level, streak and last active.
4. **Later: teacher pictures.** A storage account, teacher upload, and pictures shown next to or instead of the emoji. Pictures are read from Blob directly by the browser.

## Decisions and rejected alternatives

| Option | Why it wasn't chosen |
|---|---|
| Python API | The user prefers C#. Static Web Apps Free supports C# Functions on .NET 10. |
| App Service F1 with one ASP.NET Core app | Its CPU quota of 3 minutes per 5 minutes (and 60 per day) stops the app with HTTP 403 when exceeded. It also limits outgoing data to 165 MB/day. |
| Separate Function App with Key Vault and managed identity | Handles secrets better, but needs an extra storage account and Key Vault calls (cents), and linking it to Static Web Apps needs the Standard plan (about $9/month). This is the upgrade path. |
| Azure SQL free offer | Pauses itself and takes about a minute to wake up. |
| Table Storage | Costs cents, and its 64 KB limit per field doesn't fit the progress object. |
| Generated login codes and QR cards, teacher manages pupils in the app | More work than this class needs; passwords in configuration are enough. |
| Built-in Static Web Apps login (Microsoft/GitHub) for the teacher | Not needed while a single teacher password is enough; it can be added later without other changes. |

## Risks

- **No uptime guarantee:** Static Web Apps Free has no SLA. The Standard plan (about $9/month) adds one.
- **Cold start:** the first request after an idle period takes a few seconds, so the login screen shows a spinner.
- **Guessable passwords:** short passwords can be guessed by a script. That's accepted given what's at stake (game progress only).
- **Children's data:** store only first names or nicknames, in an EU region (West Europe). Ask the school whether parents need a data-protection notice.

## Open questions

1. What title should the children see instead of "Nóra angol kalandja"?
2. Is `classroom/` a good folder name?
3. Should the GitHub Pages demo stay online after the move?
