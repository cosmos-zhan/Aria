import logging
import pytest
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import text, select, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient
from app.main import create_app
from app.models import Feature, Task, Event, EntityLink
from app.services import engineering as svc
from seed_demo import seed


def proposal(c, p, f):
    r = c.post(
        f'/api/projects/{p["id"]}/proposals',
        json={
            "feature_id": f["id"],
            "title": "Design",
            "content": "V1 text",
            "change_reason": "Initial plan",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def adr(c, p, f, pr=None):
    r = c.post(
        f'/api/projects/{p["id"]}/decisions',
        json={
            "feature_id": f["id"],
            "proposal_id": pr["id"] if pr else None,
            "title": "ADR 1",
            "context": "Choose implementation",
            "alternatives": [
                {"title": "A", "description": "Simple"},
                {"title": "B", "description": "Extensible"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def task(c, p, f, title="Task"):
    r = c.post(
        f'/api/projects/{p["id"]}/tasks', json={"feature_id": f["id"], "title": title}
    )
    assert r.status_code == 201, r.text
    return r.json()


def event_list(c, p):
    return c.get(f'/api/projects/{p["id"]}/events').json()


def test_embedded_migrations_preserve_application_logging(db_url, caplog, monkeypatch):
    logger = logging.getLogger("projectgraph.server")
    monkeypatch.setattr(logger, "disabled", False)
    with caplog.at_level(logging.INFO, logger=logger.name):
        with TestClient(create_app(db_url)) as c:
            assert c.get("/api/health").status_code == 200
            logger.info("Application logging survives startup migrations")
    assert "Application logging survives startup migrations" in caplog.text


def test_vertical_loop_shared_views_and_no_fake_verification(client, workspace):
    p, f = workspace
    pr = proposal(client, p, f)
    adr(client, p, f, pr)
    t = task(client, p, f)
    for status in ["in_progress", "implemented"]:
        assert (
            client.patch(f'/api/tasks/{t["id"]}', json={"status": status}).status_code
            == 200
        )
    o = client.get(f'/api/projects/{p["id"]}/overview').json()
    assert o["task_counts"]["implemented"] == 1 and o["feature_counts"]["planned"] == 1
    assert (
        o["verification"]["available"] is False
        and o["verification"]["tested"] is None
        and o["verification"]["accepted"] is None
    )
    g = client.get(f'/api/projects/{p["id"]}/graph').json()
    assert len(g["nodes"]) == 4 and len(g["edges"]) == 4
    assert {e["relation_type"] for e in g["edges"]} == {
        "has_task",
        "has_proposal",
        "has_decision",
        "informs",
    }
    assert "task.status_changed" in {e["event_type"] for e in event_list(client, p)}
    assert all(e["occurred_at"].endswith("Z") for e in event_list(client, p))


def test_proposal_append_only_and_stale_write(client, workspace):
    p, f = workspace
    pr = proposal(client, p, f)
    url = f'/api/proposals/{pr["id"]}'
    assert client.patch(url, json={"content": "Silent overwrite"}).status_code == 422
    body = {"expected_version": 1, "content": "V2 text", "change_reason": "Refine API"}
    r = client.post(url + "/revisions", json=body)
    assert r.status_code == 201 and r.json()["version"] == 2
    assert client.post(url + "/revisions", json=body).status_code == 409
    revisions = client.get(url + "/revisions").json()
    assert [r["content"] for r in revisions] == ["V1 text", "V2 text"]
    assert revisions[1]["change_reason"] == "Refine API"
    assert client.patch(
        url + f'/revisions/{revisions[0]["id"]}', json={"content": "x"}
    ).status_code in [404, 405]


def test_adr_confirmed_history_and_status_constraints(client, workspace):
    p, f = workspace
    pr = proposal(client, p, f)
    d = adr(client, p, f, pr)
    url = f'/api/decisions/{d["id"]}'
    body = {
        k: d[k]
        for k in [
            "feature_id",
            "proposal_id",
            "title",
            "context",
            "alternatives",
            "selected_option",
            "rationale",
            "status",
        ]
    }
    body.update(
        status="accepted",
        selected_option="A",
        rationale="P0 simplicity",
        expected_version=1,
        change_reason="Reviewed options",
    )
    assert client.post(url + "/revisions", json=body).status_code == 201
    assert client.patch(url, json={"rationale": "overwrite"}).status_code == 405
    body.update(
        expected_version=2,
        rationale="Clarified rationale",
        change_reason="Explain maintenance cost",
    )
    assert client.post(url + "/revisions", json=body).status_code == 201
    h = client.get(url + "/revisions").json()
    assert [x["version"] for x in h] == [1, 2, 3] and h[1]["snapshot"][
        "rationale"
    ] == "P0 simplicity"
    body.update(expected_version=3, status="proposed")
    assert client.post(url + "/revisions", json=body).status_code == 422
    assert client.delete(url).status_code == 409


@pytest.mark.parametrize(
    "status", ["verified", "accepted", "tested", "implementation_complete", "nonsense"]
)
def test_task_rejects_unsupported_status(client, workspace, status):
    p, f = workspace
    t = task(client, p, f)
    assert (
        client.patch(f'/api/tasks/{t["id"]}', json={"status": status}).status_code
        == 422
    )


def test_illegal_transition_rolls_back_without_event(client, workspace):
    p, f = workspace
    t = task(client, p, f)
    before = event_list(client, p)
    assert (
        client.patch(
            f'/api/tasks/{t["id"]}', json={"status": "implemented"}
        ).status_code
        == 422
    )
    assert (
        client.get(f'/api/tasks/{t["id"]}').json()["status"] == "planned"
        and event_list(client, p) == before
    )
    assert (
        client.post(
            f'/api/projects/{p["id"]}/features',
            json={
                "code": "F02",
                "title": "Fake done",
                "status": "implementation_complete",
            },
        ).status_code
        == 422
    )


def test_invalid_cross_project_and_cross_feature_references(client, workspace):
    p, f = workspace
    p2 = client.post("/api/projects", json={"name": "Other"}).json()
    assert (
        client.post(
            f'/api/projects/{p2["id"]}/tasks',
            json={"feature_id": f["id"], "title": "Bad"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            f'/api/projects/{p["id"]}/tasks',
            json={"feature_id": "missing", "title": "Bad"},
        ).status_code
        == 404
    )
    m = client.post(f'/api/projects/{p2["id"]}/milestones', json={"title": "M"}).json()
    assert (
        client.patch(
            f'/api/features/{f["id"]}', json={"milestone_id": m["id"]}
        ).status_code
        == 422
    )
    pr = proposal(client, p, f)
    f2 = client.post(
        f'/api/projects/{p["id"]}/features', json={"code": "F02", "title": "Second"}
    ).json()
    assert (
        client.post(
            f'/api/projects/{p["id"]}/decisions',
            json={
                "feature_id": f2["id"],
                "proposal_id": pr["id"],
                "title": "Bad",
                "context": "Mismatch",
            },
        ).status_code
        == 422
    )


def test_links_cycles_scope_and_delete_guard(client, workspace):
    p, f = workspace
    ts = [task(client, p, f, str(i)) for i in range(3)]

    def link(a, b):
        return {
            "source_type": "task",
            "source_id": ts[a]["id"],
            "target_type": "task",
            "target_id": ts[b]["id"],
            "relation_type": "depends_on",
        }

    url = f'/api/projects/{p["id"]}/links'
    l = client.post(url, json=link(0, 1))
    assert l.status_code == 201
    assert client.post(url, json=link(1, 2)).status_code == 201
    assert client.post(url, json=link(2, 0)).status_code == 422
    assert client.post(url, json=link(0, 0)).status_code == 422
    assert client.post(url, json=link(0, 1)).status_code == 409
    assert client.delete(f'/api/tasks/{ts[0]["id"]}').status_code == 409
    assert client.delete(f'/api/links/{l.json()["id"]}').status_code == 204
    assert client.delete(f'/api/tasks/{ts[0]["id"]}').status_code == 204
    assert client.delete(f'/api/features/{f["id"]}').status_code == 409
    assert any(x["event_type"] == "task.deleted" for x in event_list(client, p))
    p2 = client.post("/api/projects", json={"name": "Other"}).json()
    assert (
        client.post(f'/api/projects/{p2["id"]}/links', json=link(1, 2)).status_code
        == 422
    )
    assert (
        client.post(
            url,
            json={
                "source_type": "feature",
                "source_id": f["id"],
                "target_type": "task",
                "target_id": ts[1]["id"],
                "relation_type": "depends_on",
            },
        ).status_code
        == 422
    )


def test_ownership_move_requires_unlink(client, workspace):
    p, f = workspace
    t = task(client, p, f)
    f2 = client.post(
        f'/api/projects/{p["id"]}/features', json={"code": "F02", "title": "Second"}
    ).json()
    l = client.post(
        f'/api/projects/{p["id"]}/links',
        json={
            "source_type": "feature",
            "source_id": f["id"],
            "target_type": "task",
            "target_id": t["id"],
            "relation_type": "has_task",
        },
    ).json()
    assert (
        client.patch(f'/api/tasks/{t["id"]}', json={"feature_id": f2["id"]}).status_code
        == 409
    )
    client.delete(f'/api/links/{l["id"]}')
    assert (
        client.patch(f'/api/tasks/{t["id"]}', json={"feature_id": f2["id"]}).status_code
        == 200
    )


@pytest.mark.parametrize(
    "table", ["events", "proposal_revisions", "decision_revisions"]
)
@pytest.mark.parametrize("action", ["UPDATE", "DELETE"])
def test_db_history_immutable(client, workspace, app, table, action):
    p, f = workspace
    pr = proposal(client, p, f)
    adr(client, p, f, pr)
    assignment = {
        "events": "actor_type='tampered'",
        "proposal_revisions": "content='tampered'",
        "decision_revisions": "change_reason='tampered'",
    }[table]
    sql = (
        f"UPDATE {table} SET {assignment}"
        if action == "UPDATE"
        else f"DELETE FROM {table}"
    )
    with pytest.raises(IntegrityError):
        with app.state.engine.begin() as c:
            c.execute(text(sql))


def test_db_foreign_keys_and_link_scope(client, workspace, app):
    p, f = workspace
    p2 = client.post("/api/projects", json={"name": "Other"}).json()
    with pytest.raises(IntegrityError):
        with Session(app.state.engine) as db, db.begin():
            db.add(Task(project_id=p2["id"], feature_id=f["id"], title="Cross project"))
    with pytest.raises(IntegrityError):
        with Session(app.state.engine) as db, db.begin():
            db.add(
                EntityLink(
                    project_id=p["id"],
                    source_type="task",
                    source_id="missing",
                    target_type="task",
                    target_id="missing2",
                    relation_type="depends_on",
                )
            )


def test_ledger_failure_rolls_back_state(app, workspace, monkeypatch):
    p, f = workspace

    def broken(*args, **kwargs):
        raise RuntimeError("Simulated ledger failure")

    monkeypatch.setattr(svc, "emit", broken)
    with pytest.raises(RuntimeError):
        with Session(app.state.engine) as db, db.begin():
            svc.update(db, "feature", f["id"], {"title": "Should rollback"})
    with Session(app.state.engine) as db:
        assert db.get(Feature, f["id"]).title == "Structure"
        assert db.scalar(select(func.count()).select_from(Event)) == 2


def test_restart_persistence_and_filters(client, workspace, db_url):
    p, f = workspace
    pr = proposal(client, p, f)
    original = event_list(client, p)
    with TestClient(create_app(db_url)) as c:
        assert c.get(f'/api/projects/{p["id"]}/features').json()[0]["id"] == f["id"]
        assert (
            event_list(c, p) == original
            and len(c.get(f'/api/proposals/{pr["id"]}/revisions').json()) == 1
        )
        filtered = c.get(
            f'/api/projects/{p["id"]}/events?entity_type=proposal&event_type=proposal.revised'
        ).json()
        assert len(filtered) == 1 and filtered[0]["event_type"] == "proposal.revised"
        assert (
            c.get(f'/api/projects/{p["id"]}/events?limit=1&offset=1').json()
            == original[1:2]
        )


def test_idempotent_seed_planning_only(app, client):
    a, c1 = seed(app.state.engine)
    b, c2 = seed(app.state.engine)
    assert c1 and not c2 and a == b and len(client.get("/api/projects").json()) == 1
    features = client.get(f"/api/projects/{a}/features").json()
    assert len(features) == 9 and {x["status"] for x in features} == {"planned"}
    assert len(client.get(f"/api/projects/{a}/milestones").json()) == 3
    assert {x["status"] for x in client.get(f"/api/projects/{a}/tasks").json()} == {
        "planned"
    }
    assert {x["status"] for x in client.get(f"/api/projects/{a}/decisions").json()} == {
        "proposed"
    }
    assert all(
        x["actor_type"] == "seed"
        for x in client.get(f"/api/projects/{a}/events").json()
    )


def test_concurrent_revision_conflict(client, workspace):
    p, f = workspace
    pr = proposal(client, p, f)

    def revise(i):
        return client.post(
            f'/api/proposals/{pr["id"]}/revisions',
            json={
                "expected_version": 1,
                "content": f"Writer {i}",
                "change_reason": "Concurrent test",
            },
        ).status_code

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(revise, [1, 2]))
    assert (
        sorted(results) == [201, 409]
        and len(client.get(f'/api/proposals/{pr["id"]}/revisions').json()) == 2
    )


def test_archive_retains_history_and_disables_writes(client, workspace):
    p, f = workspace
    pr = proposal(client, p, f)
    assert client.delete(f'/api/proposals/{pr["id"]}').status_code == 204
    assert len(client.get(f'/api/proposals/{pr["id"]}/revisions').json()) == 1
    assert client.delete(f'/api/projects/{p["id"]}').status_code == 204
    assert client.get("/api/projects").json() == []
    assert (
        client.get("/api/projects?include_archived=true").json()[0]["archived"] is True
    )
    assert (
        client.post(
            f'/api/projects/{p["id"]}/features', json={"code": "F99", "title": "No"}
        ).status_code
        == 409
    )
    assert client.get(f'/api/projects/{p["id"]}/events').status_code == 200


def test_validation_and_read_only_events(client, workspace):
    p, f = workspace
    assert client.post("/api/projects", json={"name": "   "}).status_code == 422
    assert (
        client.post(
            f'/api/projects/{p["id"]}/features',
            json={"code": "F01", "title": "Duplicate"},
        ).status_code
        == 409
    )
    assert client.patch(f'/api/features/{f["id"]}', json={}).status_code == 422
    assert (
        client.patch(f'/api/features/{f["id"]}', json={"title": None}).status_code
        == 422
    )
    assert (
        client.post(
            f'/api/projects/{p["id"]}/decisions',
            json={
                "feature_id": f["id"],
                "title": "No basis",
                "context": "x",
                "status": "accepted",
            },
        ).status_code
        == 422
    )
    e = event_list(client, p)[0]
    assert client.patch(f'/api/events/{e["id"]}', json={"payload": {}}).status_code in [
        404,
        405,
    ]
    assert client.delete(f'/api/events/{e["id"]}').status_code in [404, 405]


def test_milestone_crud_dependency_and_detach(client, workspace):
    p, f = workspace
    m = client.post(
        f'/api/projects/{p["id"]}/milestones', json={"title": "M1", "order": 1}
    ).json()
    assert (
        client.patch(
            f'/api/features/{f["id"]}', json={"milestone_id": m["id"]}
        ).status_code
        == 200
    )
    assert client.delete(f'/api/milestones/{m["id"]}').status_code == 409
    assert (
        client.patch(
            f'/api/features/{f["id"]}', json={"milestone_id": None}
        ).status_code
        == 200
    )
    assert (
        client.patch(f'/api/milestones/{m["id"]}', json={"title": "Updated"}).json()[
            "title"
        ]
        == "Updated"
    )
    assert client.delete(f'/api/milestones/{m["id"]}').status_code == 204
    assert client.delete(f'/api/features/{f["id"]}').status_code == 204
    assert client.get(f'/api/features/{f["id"]}').status_code == 404
