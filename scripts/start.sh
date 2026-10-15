#!/usr/bin/env bash
set -euo pipefail
root_path="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_path"
if [[ ! -x .venv/bin/python || ! -f frontend/dist/index.html ]]; then
  printf 'Run ./scripts/bootstrap.sh first.\n' >&2
  exit 1
fi
.venv/bin/python scripts/seed_demo.py
exec .venv/bin/python -m uvicorn app.main:app --app-dir backend --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
