# ProjectGraph development in Aria

The user designated **https://github.com/cosmos-zhan/Aria** as the canonical
repository for this project on 2026-10-12. Use this repository for subsequent
development and code updates. Keep the application name ProjectGraph unless
the user requests a rename.

## Working rules

- Keep engineering objects in SQLite as the source of truth; all pages use the
  same backend API.
- Persist formal state changes and their append-only events in one transaction.
- Append proposal and ADR revisions instead of overwriting history.
- Validate references, project ownership, allowed statuses, and dependencies.
- Keep implementation progress separate from test and acceptance evidence.
- MiniLab is a planning example. Do not claim its business features are
  implemented merely because their planning records exist.
- The delivered P0 runs on Linux, CPU only, with a single SQLite database.
  Follow new user requirements when extending its scope.
- Do not commit runtime databases, credentials, dependency caches, virtual
  environments, or generated build caches. Keep `frontend/dist` as a release
  artifact rather than tracked source.
- Describe only tests that were actually executed. Document any platform or
  environment limitations honestly.

## Useful commands (from the repository root)

```bash
./scripts/bootstrap.sh
./scripts/start.sh
.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run build
npm --prefix frontend run test:e2e
.venv/bin/python scripts/smoke_restart.py
.venv/bin/python scripts/smoke_startup.py
```

Read `README.md` and `docs/architecture.md` before changing the architecture.
Use the existing lightweight service layer, API client, and shared workspace
state rather than adding independent mock state or an Agent framework.
