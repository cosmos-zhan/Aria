"""Immutable ledgers, scoped polymorphic link guards and delete protection."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

TABLES = {
    "feature": "features",
    "task": "tasks",
    "proposal": "proposals",
    "decision": "decisions",
}


def upgrade():
    for table in ["events", "proposal_revisions", "decision_revisions"]:
        for action in ["UPDATE", "DELETE"]:
            op.execute(
                f"CREATE TRIGGER {table}_no_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT, 'Append-only history'); END"
            )
    for action in ["INSERT", "UPDATE"]:
        for side in ["source", "target"]:
            for kind, table in TABLES.items():
                op.execute(
                    f"""CREATE TRIGGER links_{side}_{kind}_{action.lower()} BEFORE {action} ON entity_links
                    WHEN NEW.{side}_type='{kind}' AND NOT EXISTS (SELECT 1 FROM {table} WHERE id=NEW.{side}_id AND project_id=NEW.project_id)
                    BEGIN SELECT RAISE(ABORT, 'Invalid or cross-project link endpoint'); END"""
                )
        op.execute(
            f"""CREATE TRIGGER links_relation_{action.lower()} BEFORE {action} ON entity_links
            WHEN NOT ((NEW.source_type='feature' AND NEW.target_type='task' AND NEW.relation_type='has_task')
                OR (NEW.source_type='feature' AND NEW.target_type='proposal' AND NEW.relation_type='has_proposal')
                OR (NEW.source_type='feature' AND NEW.target_type='decision' AND NEW.relation_type='has_decision')
                OR (NEW.source_type='proposal' AND NEW.target_type='decision' AND NEW.relation_type='informs')
                OR (NEW.source_type='task' AND NEW.target_type='task' AND NEW.relation_type='depends_on'))
                OR NEW.source_id=NEW.target_id
            BEGIN SELECT RAISE(ABORT, 'Unsupported link relation'); END"""
        )
        for kind, table in [
            ("task", "tasks"),
            ("proposal", "proposals"),
            ("decision", "decisions"),
        ]:
            op.execute(
                f"""CREATE TRIGGER links_owner_{kind}_{action.lower()} BEFORE {action} ON entity_links
                WHEN NEW.source_type='feature' AND NEW.target_type='{kind}'
                AND NOT EXISTS (SELECT 1 FROM {table} WHERE id=NEW.target_id AND feature_id=NEW.source_id)
                BEGIN SELECT RAISE(ABORT, 'Ownership link mismatch'); END"""
            )
        op.execute(
            f"""CREATE TRIGGER links_informs_{action.lower()} BEFORE {action} ON entity_links
            WHEN NEW.relation_type='informs' AND NOT EXISTS (SELECT 1 FROM proposals p JOIN decisions d ON d.feature_id=p.feature_id
                WHERE p.id=NEW.source_id AND d.id=NEW.target_id)
            BEGIN SELECT RAISE(ABORT, 'Proposal and ADR feature mismatch'); END"""
        )
        op.execute(
            f"""CREATE TRIGGER decisions_proposal_{action.lower()} BEFORE {action} ON decisions
            WHEN NEW.proposal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proposals WHERE id=NEW.proposal_id AND feature_id=NEW.feature_id AND project_id=NEW.project_id)
            BEGIN SELECT RAISE(ABORT, 'ADR proposal mismatch'); END"""
        )
    for kind, table in TABLES.items():
        op.execute(
            f"""CREATE TRIGGER {table}_link_delete_guard BEFORE DELETE ON {table}
            WHEN EXISTS (SELECT 1 FROM entity_links WHERE (source_type='{kind}' AND source_id=OLD.id) OR (target_type='{kind}' AND target_id=OLD.id))
            BEGIN SELECT RAISE(ABORT, 'Entity still has links'); END"""
        )
    op.execute(
        """CREATE TRIGGER tasks_owner_update_guard BEFORE UPDATE OF feature_id ON tasks
        WHEN NEW.feature_id != OLD.feature_id AND EXISTS (SELECT 1 FROM entity_links WHERE target_type='task' AND target_id=OLD.id AND relation_type='has_task')
        BEGIN SELECT RAISE(ABORT, 'Remove ownership links before moving task'); END"""
    )


def downgrade():
    # Deliberately disallow destructive downgrades of audited history in P0.
    raise RuntimeError(
        "P0 audit history migration cannot be downgraded; restore a database backup instead"
    )
