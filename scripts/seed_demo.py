#!/usr/bin/env python3
"""Idempotent, atomic MiniLab planning-only seed. No experiments are executed."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import make_engine
from app.main import migrate
from app.models import Project
from app.services.engineering import (
    create_project,
    create,
    create_proposal,
    revise_proposal,
    create_decision,
    create_link,
)

FEATURES = [
    ("F01", "分析代码库结构与功能", 0),
    ("F02", "方案生成与代码实现", 0),
    ("F03", "自动代码测试", 0),
    ("F04", "方案变更与决策记录", 0),
    ("F05", "自动生成实验脚本", 1),
    ("F06", "CPU/GPU 资源调度与监控", 1),
    ("F07", "实验生命周期与结果记录", 1),
    ("F08", "实验结果可视化", 2),
    ("F09", "方案变更过程可视化", 0),
]


def seed(engine):
    migrate(engine)
    with Session(engine, expire_on_commit=False) as db, db.begin():
        existing = db.scalar(select(Project).where(Project.demo_key == "minilab-p0"))
        if existing:
            return existing.id, False
        p = create_project(
            db,
            {
                "name": "MiniLab",
                "description": "单机自动化实验助手的工程规划。此处仅管理规划；九项业务功能尚未开发。所有示例方案、任务和 ADR 均标记为 Demo。",
            },
            "seed",
            "minilab-p0",
        )
        milestones = [
            create(
                db,
                "milestone",
                p.id,
                {"title": title, "description": desc, "order": i + 1},
                "seed",
            )
            for i, (title, desc) in enumerate(
                [
                    ("M1 · AI 开发基础", "F01 / F02 / F03 / F04 / F09"),
                    ("M2 · 实验执行基础", "F05 / F06 / F07"),
                    ("M3 · 实验结果展示", "F08"),
                ]
            )
        ]
        features = {
            code: create(
                db,
                "feature",
                p.id,
                {
                    "code": code,
                    "title": title,
                    "description": "MiniLab 后续开发规划，P0 尚未实现该业务。",
                    "milestone_id": milestones[m].id,
                },
                "seed",
            )
            for code, title, m in FEATURES
        }
        f = features["F06"]
        proposal = create_proposal(
            db,
            p.id,
            {
                "feature_id": f.id,
                "title": "[Demo] 资源采集方案",
                "content": "# V1 · 命令行采集\nCPU 指标读取 /proc。未来 GPU 指标考虑 nvidia-smi。\n本记录仅为规划，不执行资源采集。",
                "change_reason": "[Demo] 建立初始资源采集规划",
                "status": "candidate",
            },
            "seed",
        )
        revise_proposal(
            db,
            proposal.id,
            {
                "expected_version": 1,
                "content": "# V2 · 统一资源接口\n定义 ResourceProvider 接口。CPU 指标与 GPU 指标分开实现。\n备选 A：nvidia-smi；备选 B：NVML。P0 只记录方案，不引入 CUDA、GPU 或采集依赖。",
                "change_reason": "[Demo] 为 CPU-only 与后续 GPU 扩展划分接口边界",
            },
            "seed",
        )
        a = create(
            db,
            "task",
            p.id,
            {
                "feature_id": f.id,
                "title": "[Demo] 设计资源采集接口",
                "description": "仅规划：定义 CPU/GPU ResourceProvider 返回结构。",
            },
            "seed",
        )
        b = create(
            db,
            "task",
            p.id,
            {
                "feature_id": f.id,
                "title": "[Demo] 明确资源采集验收条件",
                "description": "后续应补充采集频率、异常处理与测试证据。",
            },
            "seed",
        )
        create_link(
            db,
            p.id,
            {
                "source_type": "task",
                "source_id": b.id,
                "target_type": "task",
                "target_id": a.id,
                "relation_type": "depends_on",
            },
            "seed",
        )
        create_decision(
            db,
            p.id,
            {
                "feature_id": f.id,
                "proposal_id": proposal.id,
                "title": "[Demo] GPU 指标采集方式待定",
                "context": "未来 MiniLab 需要资源监控；当前只比较候选方案，尚未开发。",
                "alternatives": [
                    {
                        "title": "Option A · nvidia-smi",
                        "description": "命令行方式，易于原型验证；后续评估进程开销。",
                    },
                    {
                        "title": "Option B · NVML",
                        "description": "库接口，后续评估安装、兼容性与错误处理。",
                    },
                ],
                "selected_option": "",
                "rationale": "待后续实测后再确认技术决策。",
                "status": "proposed",
                "change_reason": "[Demo] 保存候选方案，暂不作最终决策",
            },
            "seed",
        )
        return p.id, True


if __name__ == "__main__":
    engine = make_engine()
    try:
        project_id, created = seed(engine)
        print(f'MiniLab {"created" if created else "already exists"}: {project_id}')
    finally:
        engine.dispose()
