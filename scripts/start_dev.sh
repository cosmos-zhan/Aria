#!/usr/bin/env bash
set -euo pipefail
root_path="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_path"
if [[ ! -x .venv/bin/python || ! -d frontend/node_modules ]]; then
  printf 'Run ./scripts/bootstrap.sh first.\n' >&2
  exit 1
fi
.venv/bin/python scripts/seed_demo.py
export PROJECTGRAPH_API_URL="http://127.0.0.1:${API_PORT:-8000}"
backend_pid='';frontend_pid=''
cleanup(){
  trap - EXIT INT TERM
  [[ -z "$frontend_pid" ]] || kill -TERM -- "-$frontend_pid" 2>/dev/null || true
  [[ -z "$backend_pid" ]] || kill -TERM -- "-$backend_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM
setsid .venv/bin/python -m uvicorn app.main:app --app-dir backend --reload --host "${HOST:-127.0.0.1}" --port "${API_PORT:-8000}" &
backend_pid=$!
setsid npm --prefix frontend run dev -- --host "${HOST:-127.0.0.1}" --port "${WEB_PORT:-5173}" &
frontend_pid=$!
printf 'ProjectGraph: http://127.0.0.1:%s | API docs: http://127.0.0.1:%s/docs\n' "${WEB_PORT:-5173}" "${API_PORT:-8000}"
wait -n "$backend_pid" "$frontend_pid"
