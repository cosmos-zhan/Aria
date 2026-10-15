"""Relational current state, immutable revisions and append-only event ledger."""

from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import (
    String,
    Text,
    Integer,
    ForeignKey,
    ForeignKeyConstraint,
    UniqueConstraint,
    CheckConstraint,
    JSON,
    DateTime,
    Boolean,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator
from app.database import Base


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Datetime must be timezone aware")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value else None


class Identity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Project(Identity, Timestamps, Base):
    __tablename__ = "projects"
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    demo_key: Mapped[str | None] = mapped_column(String(60), unique=True)


class Milestone(Identity, Timestamps, Base):
    __tablename__ = "milestones"
    __table_args__ = (
        UniqueConstraint("id", "project_id"),
        CheckConstraint(
            "status IN ('planned','in_progress','blocked','implementation_complete')",
            name="milestone_status",
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="planned")


class Feature(Identity, Timestamps, Base):
    __tablename__ = "features"
    __table_args__ = (
        UniqueConstraint("id", "project_id"),
        UniqueConstraint("project_id", "code"),
        ForeignKeyConstraint(
            ["milestone_id", "project_id"],
            ["milestones.id", "milestones.project_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status IN ('planned','in_progress','blocked','implementation_complete')",
            name="feature_status",
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    milestone_id: Mapped[str | None] = mapped_column(String(36))
    code: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="planned")


class Task(Identity, Timestamps, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("id", "project_id"),
        ForeignKeyConstraint(
            ["feature_id", "project_id"],
            ["features.id", "features.project_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status IN ('planned','in_progress','blocked','implemented')",
            name="task_status",
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    feature_id: Mapped[str] = mapped_column(String(36), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="planned")


class Proposal(Identity, Timestamps, Base):
    __tablename__ = "proposals"
    __table_args__ = (
        UniqueConstraint("id", "project_id"),
        ForeignKeyConstraint(
            ["feature_id", "project_id"],
            ["features.id", "features.project_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status IN ('draft','candidate','selected','archived')",
            name="proposal_status",
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    feature_id: Mapped[str] = mapped_column(String(36), index=True)
    title: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(32), default="draft")


class ProposalRevision(Identity, Base):
    __tablename__ = "proposal_revisions"
    __table_args__ = (
        UniqueConstraint("proposal_id", "version"),
        CheckConstraint("version > 0"),
    )
    proposal_id: Mapped[str] = mapped_column(
        ForeignKey("proposals.id", ondelete="RESTRICT"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    change_reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Decision(Identity, Timestamps, Base):
    __tablename__ = "decisions"
    __table_args__ = (
        UniqueConstraint("id", "project_id"),
        ForeignKeyConstraint(
            ["feature_id", "project_id"],
            ["features.id", "features.project_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["proposal_id", "project_id"],
            ["proposals.id", "proposals.project_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status IN ('proposed','accepted','rejected','superseded')",
            name="decision_status",
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    feature_id: Mapped[str] = mapped_column(String(36), index=True)
    proposal_id: Mapped[str | None] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(160))
    context: Mapped[str] = mapped_column(Text)
    alternatives: Mapped[list] = mapped_column(JSON, default=list)
    selected_option: Mapped[str] = mapped_column(Text, default="")
    rationale: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="proposed")
    version: Mapped[int] = mapped_column(Integer, default=1)


class DecisionRevision(Identity, Base):
    __tablename__ = "decision_revisions"
    __table_args__ = (
        UniqueConstraint("decision_id", "version"),
        CheckConstraint("version > 0"),
    )
    decision_id: Mapped[str] = mapped_column(
        ForeignKey("decisions.id", ondelete="RESTRICT"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    change_reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class EntityLink(Identity, Base):
    __tablename__ = "entity_links"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "source_type",
            "source_id",
            "target_type",
            "target_id",
            "relation_type",
        ),
        CheckConstraint(
            "source_type IN ('feature','task','proposal','decision') AND target_type IN ('feature','task','proposal','decision')",
            name="link_types",
        ),
        CheckConstraint(
            "relation_type IN ('has_task','has_proposal','has_decision','informs','depends_on')",
            name="link_relation",
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    source_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(36))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(36))
    relation_type: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Event(Identity, Base):
    __tablename__ = "events"
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    entity_type: Mapped[str] = mapped_column(String(32), index=True)
    entity_id: Mapped[str] = mapped_column(String(36))
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    actor_type: Mapped[str] = mapped_column(String(32), default="user")
    occurred_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=now, index=True
    )
    payload: Mapped[dict] = mapped_column(JSON)


ENTITIES = {
    "project": Project,
    "milestone": Milestone,
    "feature": Feature,
    "task": Task,
    "proposal": Proposal,
    "decision": Decision,
    "link": EntityLink,
}
