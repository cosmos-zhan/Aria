#!/usr/bin/env python3
"""Verify the documented launchers and SIGINT cleanup on an isolated SQLite DB.

Requires bootstrap.sh to have completed. Uses Linux process groups and reserved
test ports; refuses to run if any test port is already occupied.
"""

import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PROD_PORT = int(os.getenv("PROJECTGRAPH_STARTUP_PORT", "8022"))
API_PORT = int(os.getenv("PROJECTGRAPH_STARTUP_API_PORT", "8023"))
WEB_PORT = int(os.getenv("PROJECTGRAPH_STARTUP_WEB_PORT", "5176"))


def listening(port):
    with socket.socket() as connection:
        connection.settimeout(0.2)
        return connection.connect_ex(("127.0.0.1", port)) == 0


def ready(process, api_port, web_port):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Launcher exited before readiness; inspect the log")
        try:
            with urlopen(f"http://127.0.0.1:{api_port}/api/health", timeout=1) as response:
                assert json.load(response)["status"] == "ok"
            with urlopen(f"http://127.0.0.1:{web_port}/", timeout=1) as response:
                assert "ProjectGraph" in response.read().decode()
            return
        except (URLError, OSError):
            time.sleep(0.1)
    raise RuntimeError("Launcher readiness timeout")


def stop(process):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGINT)
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            raise RuntimeError("Launcher did not stop on SIGINT")


def main():
    ports = [PROD_PORT, API_PORT, WEB_PORT]
    if len(set(ports)) != len(ports):
        raise RuntimeError("Use distinct test ports")
    for port in ports:
        if listening(port):
            raise RuntimeError(f"Test port {port} is occupied; choose another port")
    results = []
    with tempfile.TemporaryDirectory(prefix="projectgraph-startup-") as directory:
        base_env = os.environ | {
            "PROJECTGRAPH_DATABASE_URL": f"sqlite:///{directory}/startup.db",
            "HOST": "127.0.0.1",
        }
        scenarios = [
            ("start.sh", PROD_PORT, PROD_PORT, {"PORT": str(PROD_PORT)}),
            (
                "start_dev.sh",
                API_PORT,
                WEB_PORT,
                {"API_PORT": str(API_PORT), "WEB_PORT": str(WEB_PORT)},
            ),
        ]
        for launcher, api_port, web_port, overrides in scenarios:
            log_path = Path(directory) / f"{launcher}.log"
            try:
                with log_path.open("w") as log:
                    process = subprocess.Popen(
                        [str(ROOT / "scripts" / launcher)],
                        cwd=ROOT,
                        env=base_env | overrides,
                        start_new_session=True,
                        stdout=log,
                        stderr=log,
                    )
                    try:
                        ready(process, api_port, web_port)
                    finally:
                        stop(process)
                deadline = time.monotonic() + 5
                while any(listening(port) for port in {api_port, web_port}):
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Launcher left a service listening after SIGINT")
                    time.sleep(0.1)
            except Exception:
                print(log_path.read_text(), flush=True)
                raise
            results.append({"launcher": launcher, "ready": True, "SIGINT_cleanup": True})
    print(json.dumps({"status": "passed", "database": "temporary / cleaned", "checks": results}, indent=2))


if __name__ == "__main__":
    main()
