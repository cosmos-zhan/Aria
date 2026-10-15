#!/usr/bin/env bash
set -euo pipefail
root_path="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_path"
python_command="${PYTHON:-python3}"
"$python_command" -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock.txt
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python scripts/seed_demo.py
printf '\nReady. Run: ./scripts/start.sh\n'
