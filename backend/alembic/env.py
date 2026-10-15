from logging.config import fileConfig
from alembic import context
from app.database import Base, make_engine
import app.models

config = context.config
if config.config_file_name and config.attributes.get("connection") is None:
    # Embedded migrations must retain the application's server/test loggers.
    # Configure logging only for the standalone Alembic CLI.
    fileConfig(config.config_file_name, disable_existing_loggers=False)
target_metadata = Base.metadata


def migrate(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()
elif config.attributes.get("connection") is not None:
    migrate(config.attributes["connection"])
else:
    engine = make_engine()
    with engine.begin() as connection:
        migrate(connection)
    engine.dispose()
