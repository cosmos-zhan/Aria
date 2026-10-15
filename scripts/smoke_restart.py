#!/usr/bin/env python3
"""Exercise the built SPA, real HTTP writes, seed idempotency and OS process restart.

Runs on a temporary SQLite file and does not modify the user's engineering data.
Requires an available loopback port and an already built frontend/dist.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PORT = int(os.getenv("PROJECTGRAPH_SMOKE_PORT", "8020"))
BASE = f"http://127.0.0.1:{PORT}"


def request(path, body=None, method="GET"):
    data = json.dumps(body).encode() if body is not None else None
    with urlopen(
        Request(
            BASE + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"},
        ),
        timeout=3,
    ) as response:
        return response.status, response.read()


def json_request(path, body=None, method="GET"):
    status, data = request(path, body, method)
    assert 200 <= status < 300
    return json.loads(data)


def start(env, log):
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--app-dir",
            str(ROOT / "backend"),
            "--host",
            "127.0.0.1",
            "--port",
            str(PORT),
        ],
        cwd=ROOT,
        env=env,
        stdout=log,
        stderr=log,
    )
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Backend exited; inspect server log")
        try:
            if json_request("/api/health")["status"] == "ok":
                return process
        except (URLError, OSError):
            pass
        time.sleep(0.1)
    stop(process)
    raise RuntimeError("Backend readiness timeout")


def stop(process):
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


def main():
    assert (
        ROOT / "frontend/dist/index.html"
    ).is_file(), "Run npm --prefix frontend run build first"
    with tempfile.TemporaryDirectory(prefix="projectgraph-smoke-") as tmp:
        env = os.environ | {"PROJECTGRAPH_DATABASE_URL": f"sqlite:///{tmp}/smoke.db"}
        seed_command = [sys.executable, str(ROOT / "scripts/seed_demo.py")]
        seed1 = subprocess.check_output(seed_command, cwd=ROOT, env=env, text=True)
        seed2 = subprocess.check_output(seed_command, cwd=ROOT, env=env, text=True)
        assert "created:" in seed1 and "already exists:" in seed2
        with open(Path(tmp) / "server.log", "w+") as log:
            process = start(env, log)
            try:
                _, html = request("/")
                assert "ProjectGraph" in html.decode()
                asset = re.search(r'src="([^"]+\.js)"', html.decode()).group(1)
                assert request(asset)[0] == 200
                css = re.search(r'href="([^"]+\.css)"', html.decode()).group(1)
                _, styles = request(css)
                assert "Noto Sans SC" in styles.decode()
                font = re.search(r"url\(([^)]+\.woff2)\)", styles.decode()).group(1)
                if not font.startswith("/"):
                    font = "/assets/" + font
                assert request(font)[0] == 200
                try:
                    request("/api/not-a-real-endpoint")
                except HTTPError as e:
                    assert e.code == 404
                else:
                    raise AssertionError("Unknown API path served SPA HTML")
                projects = json_request("/api/projects")
                assert len(projects) == 1
                demo = projects[0]
                assert len(json_request(f'/api/projects/{demo["id"]}/features')) == 9
                p = json_request(
                    "/api/projects", {"name": "Real process restart test"}, "POST"
                )
                f = json_request(
                    f'/api/projects/{p["id"]}/features',
                    {"code": "F01", "title": "Persistence"},
                    "POST",
                )
                t = json_request(
                    f'/api/projects/{p["id"]}/tasks',
                    {"feature_id": f["id"], "title": "Survive restart"},
                    "POST",
                )
                json_request(
                    f'/api/tasks/{t["id"]}', {"status": "in_progress"}, "PATCH"
                )
                before = json_request(f'/api/projects/{p["id"]}/events')
                # Match the workspace's parallel API fan-out on a real server.
                paths = [
                    f'/api/projects/{p["id"]}/{kind}'
                    for kind in (
                        "milestones", "features", "tasks", "proposals",
                        "decisions", "links", "events", "graph", "overview",
                    )
                ]
                with ThreadPoolExecutor(max_workers=9) as reads:
                    assert len(list(reads.map(json_request, paths * 20))) == 180
            finally:
                stop(process)
            process = start(env, log)
            try:
                assert json_request(f'/api/tasks/{t["id"]}')["status"] == "in_progress"
                assert json_request(f'/api/projects/{p["id"]}/events') == before
                assert (
                    json_request(f'/api/projects/{p["id"]}/overview')["task_counts"][
                        "in_progress"
                    ]
                    == 1
                )
            finally:
                stop(process)
    print(
        json.dumps(
            {
                "status": "passed",
                "checks": [
                    "production SPA and JS/CSS/font assets",
                    "unknown API path returns 404",
                    "idempotent seed / 9 planned features",
                    "real HTTP CRUD and event writes",
                    "180 parallel workspace reads with 9 workers",
                    "OS backend termination and restart",
                    "identical event history and persisted task status",
                ],
                "database": "temporary / cleaned",
                "port": PORT,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
