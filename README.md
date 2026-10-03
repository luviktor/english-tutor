# English Tutor

English-learning games for 9-year-old Hungarian children.

| Folder | What |
|---|---|
| [`demo/`](demo/) | **Nóra angol kalandja** – the original app for one child: a local Python server plus a vanilla JS frontend, also deployable as a static GitHub Pages site. See [`demo/README.md`](demo/README.md) for features, the dictionary format and how to run it. |
| [`classroom/`](classroom/) | **Angol kaland** – the same game for a whole class on Azure, free of charge: Static Web Apps with a C# (.NET 10) Functions API and Cosmos DB, pupil passwords and a teacher view. See [`classroom/README.md`](classroom/README.md). |
| [`infra/`](infra/) | Bicep template and the one-time Azure setup for `classroom/`. |
| [`docs/`](docs/) | [`azure-plan.md`](docs/azure-plan.md): why the classroom version is built the way it is. |

Quick start (demo): double-click `demo/start.bat`, or run `py demo/server.py`.
