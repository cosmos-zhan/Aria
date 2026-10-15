from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from alembic.config import Config
from alembic import command
from app.database import make_engine
from app.api.routes import router

BACKEND = Path(__file__).resolve().parents[1]


def migrate(engine):
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def create_app(database_url=None, run_migrations=True):
    engine = make_engine(database_url)

    @asynccontextmanager
    async def lifespan(app):
        if run_migrations:
            migrate(engine)
        yield
        engine.dispose()

    app = FastAPI(title="ProjectGraph P0", version="0.1.0", lifespan=lifespan)
    app.state.engine = engine
    app.include_router(router)

    @app.exception_handler(IntegrityError)
    async def conflict(request, exc):
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Database constraint rejected this change. Check duplicate codes, dependencies, valid links or immutable history."
            },
        )

    # Optional single-process production mode after `npm run build`.
    dist = BACKEND.parent / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str):
            if path == "api" or path.startswith("api/"):
                return JSONResponse(
                    status_code=404, content={"detail": "API route not found"}
                )
            return FileResponse(dist / "index.html")

    return app


app = create_app()
