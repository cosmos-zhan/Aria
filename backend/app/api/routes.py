from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Project
from app.events.ledger import record
from app.schemas import *
from app.services import engineering as service

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0", "verification_enabled": False}


@router.get("/projects")
def projects(include_archived: bool = False, db: Session = Depends(get_db)):
    query = select(Project).order_by(Project.created_at, Project.id)
    if not include_archived:
        query = query.where(Project.archived.is_(False))
    return [record(p) for p in db.scalars(query)]


@router.post("/projects", status_code=201)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    return record(service.create_project(db, payload.model_dump()))


@router.get("/projects/{project_id}")
def project(project_id: str, db: Session = Depends(get_db)):
    return record(service.get(db, "project", project_id))


@router.patch("/projects/{project_id}")
def patch_project(
    project_id: str, payload: ProjectPatch, db: Session = Depends(get_db)
):
    return record(
        service.update(
            db, "project", project_id, payload.model_dump(exclude_unset=True)
        )
    )


@router.delete("/projects/{project_id}", status_code=204)
def archive_project(project_id: str, db: Session = Depends(get_db)):
    service.delete(db, "project", project_id)
    return Response(status_code=204)


@router.get("/projects/{project_id}/overview")
def overview(project_id: str, db: Session = Depends(get_db)):
    return service.overview(db, project_id)


# Factories keep identical scope, transaction and validation behavior across basic CRUD.
def register_crud(kind, plural, create_schema, patch_schema):
    def listing(project_id: str, db: Session = Depends(get_db)):
        return [record(x) for x in service.rows(db, kind, project_id)]

    def creating(project_id: str, payload, db: Session = Depends(get_db)):
        return record(service.create(db, kind, project_id, payload.model_dump()))

    creating.__annotations__["payload"] = create_schema

    def reading(entity_id: str, db: Session = Depends(get_db)):
        return record(service.get(db, kind, entity_id))

    def updating(entity_id: str, payload, db: Session = Depends(get_db)):
        return record(
            service.update(db, kind, entity_id, payload.model_dump(exclude_unset=True))
        )

    updating.__annotations__["payload"] = patch_schema

    def deleting(entity_id: str, db: Session = Depends(get_db)):
        service.delete(db, kind, entity_id)
        return Response(status_code=204)

    for suffix, endpoint, methods, status in [
        (f"/projects/{{project_id}}/{plural}", listing, ["GET"], 200),
        (f"/projects/{{project_id}}/{plural}", creating, ["POST"], 201),
        (f"/{plural}/{{entity_id}}", reading, ["GET"], 200),
        (f"/{plural}/{{entity_id}}", updating, ["PATCH"], 200),
        (f"/{plural}/{{entity_id}}", deleting, ["DELETE"], 204),
    ]:
        router.add_api_route(
            suffix,
            endpoint,
            methods=methods,
            status_code=status,
            name=f"{kind}_{endpoint.__name__}",
        )


register_crud("milestone", "milestones", MilestoneCreate, MilestonePatch)
register_crud("feature", "features", FeatureCreate, FeaturePatch)
register_crud("task", "tasks", TaskCreate, TaskPatch)


@router.get("/projects/{project_id}/proposals")
def proposals(project_id: str, db: Session = Depends(get_db)):
    return [record(x) for x in service.rows(db, "proposal", project_id)]


@router.post("/projects/{project_id}/proposals", status_code=201)
def create_proposal(
    project_id: str, payload: ProposalCreate, db: Session = Depends(get_db)
):
    return record(service.create_proposal(db, project_id, payload.model_dump()))


@router.get("/proposals/{entity_id}")
def proposal(entity_id: str, db: Session = Depends(get_db)):
    return record(service.get(db, "proposal", entity_id))


@router.patch("/proposals/{entity_id}")
def patch_proposal(
    entity_id: str, payload: ProposalPatch, db: Session = Depends(get_db)
):
    return record(
        service.update(
            db, "proposal", entity_id, payload.model_dump(exclude_unset=True)
        )
    )


@router.delete("/proposals/{entity_id}", status_code=204)
def archive_proposal(entity_id: str, db: Session = Depends(get_db)):
    service.delete(db, "proposal", entity_id)
    return Response(status_code=204)


@router.get("/proposals/{entity_id}/revisions")
def proposal_revisions(entity_id: str, db: Session = Depends(get_db)):
    return [record(x) for x in service.proposal_revisions(db, entity_id)]


@router.post("/proposals/{entity_id}/revisions", status_code=201)
def revise_proposal(
    entity_id: str, payload: ProposalRevisionCreate, db: Session = Depends(get_db)
):
    return record(service.revise_proposal(db, entity_id, payload.model_dump()))


@router.get("/projects/{project_id}/decisions")
def decisions(project_id: str, db: Session = Depends(get_db)):
    return [record(x) for x in service.rows(db, "decision", project_id)]


@router.post("/projects/{project_id}/decisions", status_code=201)
def create_decision(
    project_id: str, payload: DecisionCreate, db: Session = Depends(get_db)
):
    return record(service.create_decision(db, project_id, payload.model_dump()))


@router.get("/decisions/{entity_id}")
def decision(entity_id: str, db: Session = Depends(get_db)):
    return record(service.get(db, "decision", entity_id))


@router.delete("/decisions/{entity_id}", status_code=204)
def delete_decision(entity_id: str, db: Session = Depends(get_db)):
    service.delete(db, "decision", entity_id)
    return Response(status_code=204)


@router.get("/decisions/{entity_id}/revisions")
def decision_revisions(entity_id: str, db: Session = Depends(get_db)):
    return [record(x) for x in service.decision_revisions(db, entity_id)]


@router.post("/decisions/{entity_id}/revisions", status_code=201)
def revise_decision(
    entity_id: str, payload: DecisionRevisionCreate, db: Session = Depends(get_db)
):
    return record(service.revise_decision(db, entity_id, payload.model_dump()))


@router.get("/projects/{project_id}/links")
def links(project_id: str, db: Session = Depends(get_db)):
    return [record(x) for x in service.rows(db, "link", project_id)]


@router.post("/projects/{project_id}/links", status_code=201)
def create_link(project_id: str, payload: LinkCreate, db: Session = Depends(get_db)):
    return record(service.create_link(db, project_id, payload.model_dump()))


@router.delete("/links/{entity_id}", status_code=204)
def delete_link(entity_id: str, db: Session = Depends(get_db)):
    service.delete(db, "link", entity_id)
    return Response(status_code=204)


@router.get("/projects/{project_id}/graph")
def graph(
    project_id: str, feature_id: str | None = None, db: Session = Depends(get_db)
):
    return service.graph(db, project_id, feature_id)


@router.get("/projects/{project_id}/events")
def events(
    project_id: str,
    entity_type: str | None = None,
    event_type: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return [
        record(x)
        for x in service.events(db, project_id, entity_type, event_type, limit, offset)
    ]
