"""All official state mutations and their ledger entries share the caller's transaction."""

from fastapi import HTTPException
from sqlalchemy import select, func, or_, and_
from app.models import *
from app.events.ledger import emit, record

TASK_TRANSITIONS = {
    "planned": {"in_progress", "blocked"},
    "in_progress": {"planned", "blocked", "implemented"},
    "blocked": {"planned", "in_progress"},
    "implemented": {"in_progress"},
}
FEATURE_TRANSITIONS = {
    "planned": {"in_progress", "blocked"},
    "in_progress": {"planned", "blocked", "implementation_complete"},
    "blocked": {"planned", "in_progress"},
    "implementation_complete": {"in_progress"},
}
PROPOSAL_TRANSITIONS = {
    "draft": {"candidate", "archived"},
    "candidate": {"draft", "selected", "archived"},
    "selected": {"candidate", "archived"},
    "archived": {"draft"},
}
DECISION_TRANSITIONS = {
    "proposed": {"accepted", "rejected", "superseded"},
    "accepted": {"superseded"},
    "rejected": {"proposed", "superseded"},
    "superseded": set(),
}
TRANSITIONS = {
    "task": TASK_TRANSITIONS,
    "feature": FEATURE_TRANSITIONS,
    "milestone": FEATURE_TRANSITIONS,
    "proposal": PROPOSAL_TRANSITIONS,
    "decision": DECISION_TRANSITIONS,
}
ALLOWED_LINKS = {
    ("feature", "task", "has_task"),
    ("feature", "proposal", "has_proposal"),
    ("feature", "decision", "has_decision"),
    ("proposal", "decision", "informs"),
    ("task", "task", "depends_on"),
}


def fail(status, message):
    raise HTTPException(status_code=status, detail=message)


def get(db, kind, entity_id, project_id=None):
    obj = db.get(ENTITIES[kind], entity_id)
    if not obj:
        fail(404, f"{kind} {entity_id} does not exist")
    if project_id and getattr(obj, "project_id", obj.id) != project_id:
        fail(422, f"{kind} belongs to a different project")
    return obj


def active_project(db, project_id):
    p = get(db, "project", project_id)
    if p.archived:
        fail(409, "Project is archived and read-only")
    return p


def rows(db, kind, project_id):
    get(db, "project", project_id)
    cls = ENTITIES[kind]
    order = cls.order if kind == "milestone" else cls.created_at
    return db.scalars(
        select(cls).where(cls.project_id == project_id).order_by(order, cls.id)
    ).all()


def transition(kind, before, after):
    if before != after and after not in TRANSITIONS[kind][before]:
        fail(
            422,
            f"Unsupported {kind} transition: {before} → {after}. Allowed: {sorted(TRANSITIONS[kind][before])}",
        )


def references(db, kind, project_id, data):
    if data.get("milestone_id"):
        get(db, "milestone", data["milestone_id"], project_id)
    if data.get("feature_id"):
        get(db, "feature", data["feature_id"], project_id)
    if data.get("proposal_id"):
        p = get(db, "proposal", data["proposal_id"], project_id)
        if p.feature_id != data.get("feature_id"):
            fail(422, "ADR and its proposal must belong to the same feature")


def create_project(db, data, actor="user", demo_key=None):
    p = Project(**data, demo_key=demo_key)
    db.add(p)
    db.flush()
    emit(db, p.id, "project", p.id, "project.created", {"after": record(p)}, actor)
    return p


def create(db, kind, project_id, data, actor="user"):
    active_project(db, project_id)
    references(db, kind, project_id, data)
    if (
        kind in {"feature", "task", "milestone"}
        and data.get("status", "planned") != "planned"
    ):
        fail(422, f"New {kind} must start in planned status")
    obj = ENTITIES[kind](project_id=project_id, **data)
    db.add(obj)
    db.flush()
    emit(db, project_id, kind, obj.id, f"{kind}.created", {"after": record(obj)}, actor)
    return obj


def update(db, kind, entity_id, data):
    obj = get(db, kind, entity_id)
    project_id = obj.id if kind == "project" else obj.project_id
    active_project(db, project_id)
    merged = record(obj) | data
    references(db, kind, project_id, merged)
    if "status" in data:
        transition(kind, obj.status, data["status"])
    if kind == "task" and "feature_id" in data and data["feature_id"] != obj.feature_id:
        linked = db.scalar(
            select(EntityLink).where(
                EntityLink.target_id == obj.id, EntityLink.relation_type == "has_task"
            )
        )
        if linked:
            fail(409, "Remove explicit has_task links before moving this task")
    before = record(obj)
    for key, value in data.items():
        setattr(obj, key, value)
    if before == record(obj):
        return obj
    obj.updated_at = now()
    db.flush()
    event_type = (
        f"{kind}.status_changed"
        if "status" in data and before["status"] != obj.status
        else f"{kind}.updated"
    )
    emit(
        db,
        project_id,
        kind,
        obj.id,
        event_type,
        {"before": before, "after": record(obj)},
    )
    return obj


def delete(db, kind, entity_id):
    obj = get(db, kind, entity_id)
    project_id = obj.id if kind == "project" else obj.project_id
    active_project(db, project_id)
    before = record(obj)
    if kind == "project":
        obj.archived = True
        obj.updated_at = now()
        db.flush()
        emit(
            db,
            project_id,
            kind,
            obj.id,
            "project.archived",
            {"before": before, "after": record(obj)},
        )
        return
    if kind == "proposal":
        if obj.status == "archived":
            return
        obj.status = "archived"
        obj.updated_at = now()
        db.flush()
        emit(
            db,
            project_id,
            kind,
            obj.id,
            "proposal.archived",
            {"before": before, "after": record(obj)},
        )
        return
    if kind == "decision":
        fail(
            409,
            "ADRs and their revisions are retained. Create a superseded revision instead.",
        )
    link = db.scalar(
        select(EntityLink).where(
            EntityLink.project_id == project_id,
            or_(
                and_(EntityLink.source_type == kind, EntityLink.source_id == entity_id),
                and_(EntityLink.target_type == kind, EntityLink.target_id == entity_id),
            ),
        )
    )
    if link:
        fail(409, "Entity has explicit links. Remove those links before deleting it.")
    deps = {
        "milestone": [(Feature, "milestone_id")],
        "feature": [
            (Task, "feature_id"),
            (Proposal, "feature_id"),
            (Decision, "feature_id"),
        ],
    }
    for cls, key in deps.get(kind, []):
        if db.scalar(select(cls.id).where(getattr(cls, key) == entity_id).limit(1)):
            fail(
                409,
                f"Entity still has dependent {cls.__tablename__}; delete or move them first",
            )
    db.delete(obj)
    db.flush()
    emit(db, project_id, kind, entity_id, f"{kind}.deleted", {"before": before})


def create_proposal(db, project_id, data, actor="user"):
    values = dict(data)
    content, reason = values.pop("content"), values.pop("change_reason")
    if values.get("status", "draft") not in {"draft", "candidate"}:
        fail(422, "A new proposal must be draft or candidate")
    proposal = create(db, "proposal", project_id, values, actor)
    revision = ProposalRevision(
        proposal_id=proposal.id, version=1, content=content, change_reason=reason
    )
    db.add(revision)
    db.flush()
    emit(
        db,
        project_id,
        "proposal",
        proposal.id,
        "proposal.revised",
        {"revision": record(revision)},
        actor,
    )
    return proposal


def proposal_revisions(db, proposal_id):
    get(db, "proposal", proposal_id)
    return db.scalars(
        select(ProposalRevision)
        .where(ProposalRevision.proposal_id == proposal_id)
        .order_by(ProposalRevision.version)
    ).all()


def revise_proposal(db, proposal_id, data, actor="user"):
    p = get(db, "proposal", proposal_id)
    active_project(db, p.project_id)
    if p.status == "archived":
        fail(409, "Restore the archived proposal before revising it")
    version = (
        db.scalar(
            select(func.max(ProposalRevision.version)).where(
                ProposalRevision.proposal_id == p.id
            )
        )
        or 0
    )
    if data["expected_version"] != version:
        fail(
            409,
            "Proposal changed since it was loaded. Refresh before adding a revision.",
        )
    rev = ProposalRevision(
        proposal_id=p.id,
        version=version + 1,
        content=data["content"],
        change_reason=data["change_reason"],
    )
    db.add(rev)
    p.updated_at = now()
    db.flush()
    emit(
        db,
        p.project_id,
        "proposal",
        p.id,
        "proposal.revised",
        {"revision": record(rev)},
        actor,
    )
    return rev


def decision_revision(db, d, reason, actor, before=None):
    snap = record(d)
    rev = DecisionRevision(
        decision_id=d.id, version=d.version, snapshot=snap, change_reason=reason
    )
    db.add(rev)
    db.flush()
    kind = (
        "decision.accepted"
        if d.status == "accepted" and (not before or before["status"] != "accepted")
        else ("decision.revised" if before else "decision.created")
    )
    emit(
        db,
        d.project_id,
        "decision",
        d.id,
        kind,
        {"before": before, "after": snap, "revision": record(rev)},
        actor,
    )
    return rev


def create_decision(db, project_id, data, actor="user"):
    active_project(db, project_id)
    values = dict(data)
    reason = values.pop("change_reason")
    references(db, "decision", project_id, values)
    if values.get("status", "proposed") not in {"proposed", "accepted"}:
        fail(422, "New ADR must be proposed or accepted")
    d = Decision(project_id=project_id, **values)
    db.add(d)
    db.flush()
    decision_revision(db, d, reason, actor)
    return d


def revise_decision(db, decision_id, data, actor="user"):
    d = get(db, "decision", decision_id)
    active_project(db, d.project_id)
    values = dict(data)
    expected = values.pop("expected_version")
    reason = values.pop("change_reason")
    if expected != d.version:
        fail(409, "ADR changed since it was loaded. Refresh before revising.")
    if values["feature_id"] != d.feature_id or values["proposal_id"] != d.proposal_id:
        fail(
            422,
            "ADR ownership and proposal link are immutable; create a new ADR to change them",
        )
    transition("decision", d.status, values["status"])
    if d.status == "superseded":
        fail(409, "Superseded ADR is read-only")
    before = record(d)
    for key, value in values.items():
        setattr(d, key, value)
    d.version += 1
    d.updated_at = now()
    db.flush()
    decision_revision(db, d, reason, actor, before)
    return d


def decision_revisions(db, decision_id):
    get(db, "decision", decision_id)
    return db.scalars(
        select(DecisionRevision)
        .where(DecisionRevision.decision_id == decision_id)
        .order_by(DecisionRevision.version)
    ).all()


def create_link(db, project_id, data, actor="user"):
    active_project(db, project_id)
    triple = (data["source_type"], data["target_type"], data["relation_type"])
    if triple not in ALLOWED_LINKS:
        fail(422, "Unsupported entity type / relation combination")
    source = get(db, data["source_type"], data["source_id"], project_id)
    target = get(db, data["target_type"], data["target_id"], project_id)
    if source.id == target.id:
        fail(422, "Self links are not allowed")
    if triple[0] == "feature" and target.feature_id != source.id:
        fail(422, "Ownership link conflicts with actual feature reference")
    if (
        triple == ("proposal", "decision", "informs")
        and source.feature_id != target.feature_id
    ):
        fail(422, "Proposal and decision must belong to the same feature")
    if triple == ("task", "task", "depends_on"):
        links = db.scalars(
            select(EntityLink).where(
                EntityLink.project_id == project_id,
                EntityLink.relation_type == "depends_on",
            )
        ).all()
        adjacency = {}
        for link in links:
            adjacency.setdefault(link.source_id, []).append(link.target_id)
        stack, visited = [target.id], set()
        while stack:
            item = stack.pop()
            if item == source.id:
                fail(422, "Task dependency would create a cycle")
            if item not in visited:
                visited.add(item)
                stack.extend(adjacency.get(item, []))
    link = EntityLink(project_id=project_id, **data)
    db.add(link)
    db.flush()
    emit(
        db, project_id, "link", link.id, "link.created", {"after": record(link)}, actor
    )
    return link


def graph(db, project_id, feature_id=None):
    get(db, "project", project_id)
    if feature_id:
        get(db, "feature", feature_id, project_id)
    nodes, edges, keys, triples = [], [], set(), set()
    objects = {
        kind: rows(db, kind, project_id)
        for kind in ["feature", "task", "proposal", "decision"]
    }

    def edge(sk, sid, tk, tid, relation, link_id=None):
        source, target = f"{sk}:{sid}", f"{tk}:{tid}"
        key = (source, target, relation)
        if source not in keys or target not in keys or key in triples:
            return
        triples.add(key)
        edges.append(
            {
                "id": link_id or f"{source}:{target}:{relation}",
                "source": source,
                "target": target,
                "relation_type": relation,
                "link_id": link_id,
                "origin": "link" if link_id else "database",
            }
        )

    for kind, items in objects.items():
        for item in items:
            if (
                feature_id
                and (item.id if kind == "feature" else item.feature_id) != feature_id
            ):
                continue
            key = f"{kind}:{item.id}"
            keys.add(key)
            nodes.append(
                {
                    "id": key,
                    "entity_type": kind,
                    "entity_id": item.id,
                    "data": record(item),
                }
            )
    # Explicit links take priority for deduplication; foreign-key edges remain authoritative.
    for link in rows(db, "link", project_id):
        edge(
            link.source_type,
            link.source_id,
            link.target_type,
            link.target_id,
            link.relation_type,
            link.id,
        )
    for kind in ["task", "proposal", "decision"]:
        relation = {
            "task": "has_task",
            "proposal": "has_proposal",
            "decision": "has_decision",
        }[kind]
        for item in objects[kind]:
            edge("feature", item.feature_id, kind, item.id, relation)
            if kind == "decision" and item.proposal_id:
                edge("proposal", item.proposal_id, "decision", item.id, "informs")
    return {"nodes": nodes, "edges": edges}


def events(db, project_id, entity_type=None, event_type=None, limit=100, offset=0):
    get(db, "project", project_id)
    query = select(Event).where(Event.project_id == project_id)
    if entity_type:
        query = query.where(Event.entity_type == entity_type)
    if event_type:
        query = query.where(Event.event_type == event_type)
    return db.scalars(
        query.order_by(Event.occurred_at.desc(), Event.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()


def overview(db, project_id):
    data = {
        kind: rows(db, kind, project_id)
        for kind in ["milestone", "feature", "task", "proposal", "decision"]
    }

    def counts(kind):
        out = {
            s: 0 for s in (TASK_TRANSITIONS if kind == "task" else FEATURE_TRANSITIONS)
        }
        for obj in data[kind]:
            out[obj.status] += 1
        return out

    return {
        "project": record(get(db, "project", project_id)),
        "milestones": [record(x) for x in data["milestone"]],
        "feature_counts": counts("feature"),
        "task_counts": counts("task"),
        "active_tasks": [
            record(x) for x in data["task"] if x.status in {"in_progress", "blocked"}
        ],
        "pending_decisions": [
            record(x) for x in data["decision"] if x.status == "proposed"
        ],
        "recent_events": [record(x) for x in events(db, project_id, limit=8)],
        "verification": {
            "tested": None,
            "accepted": None,
            "available": False,
            "note": "P0 records implementation progress only. Test evidence and acceptance are not available.",
        },
    }
