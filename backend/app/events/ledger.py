from datetime import datetime
from sqlalchemy import inspect
from app.models import Event, Project, now


def record(entity):
    data = {}
    for column in inspect(entity).mapper.columns:
        value = getattr(entity, column.key)
        data[column.key] = (
            value.isoformat().replace("+00:00", "Z")
            if isinstance(value, datetime)
            else value
        )
    return data


def emit(db, project_id, kind, entity_id, event_type, payload, actor="user"):
    db.add(
        Event(
            project_id=project_id,
            entity_type=kind,
            entity_id=entity_id,
            event_type=event_type,
            actor_type=actor,
            payload=payload,
        )
    )
    project = db.get(Project, project_id)
    if project:
        project.updated_at = now()
    db.flush()
