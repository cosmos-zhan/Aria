import pytest
from fastapi.testclient import TestClient
from app.main import create_app


@pytest.fixture
def db_url(tmp_path):
    return f"sqlite:///{tmp_path}/engineering.db"


@pytest.fixture
def app(db_url):
    return create_app(db_url)


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def workspace(client):
    p = client.post(
        "/api/projects", json={"name": "Test", "description": "Test project"}
    ).json()
    f = client.post(
        f'/api/projects/{p["id"]}/features', json={"code": "F01", "title": "Structure"}
    ).json()
    return p, f
