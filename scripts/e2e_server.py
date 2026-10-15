"""Isolated seeded backend for Playwright. It never touches the user's database."""

import os, sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
sys.path.insert(0, str(root / "scripts"))
path = root / "artifacts" / "e2e.db"
path.parent.mkdir(exist_ok=True)
for suffix in ["", "-wal", "-shm"]:
    Path(str(path) + suffix).unlink(missing_ok=True)
os.environ["PROJECTGRAPH_DATABASE_URL"] = f"sqlite:///{path}"
from app.database import make_engine
from seed_demo import seed

engine = make_engine()
seed(engine)
engine.dispose()
import uvicorn

uvicorn.run("app.main:app", host="127.0.0.1", port=8011)
