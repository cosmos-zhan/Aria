"""SQLite engine and transaction boundary. UTC is normalized by the model type."""

import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session
from fastapi import Request

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "projectgraph.db"


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    url = url or os.getenv("PROJECTGRAPH_DATABASE_URL", f"sqlite:///{DEFAULT_DB}")
    if not url.startswith("sqlite:///"):
        raise ValueError("P0 supports SQLite only")
    path = url.removeprefix("sqlite:///")
    if path != ":memory:":
        Path(path).resolve().parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        url, connect_args={"check_same_thread": False, "timeout": 30}
    )

    @event.listens_for(engine, "connect")
    def sqlite_config(connection, _):
        connection.isolation_level = None
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=30000")
        connection.execute("PRAGMA journal_mode=WAL")

    @event.listens_for(engine, "begin")
    def begin(connection):
        # Serialize short P0 transactions to protect version numbering and seed checks.
        connection.exec_driver_sql("BEGIN IMMEDIATE")

    return engine


def get_db(request: Request):
    with Session(request.app.state.engine, expire_on_commit=False) as db:
        with db.begin():
            yield db
