import {
  ArrowRight,
  Boxes,
  Flag,
  GitPullRequest,
  CheckCircle2,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import { useWorkspace } from '../api/workspace';
import type { Selection, Page } from '../types';
import type { FormRequest } from '../components/EntityForm';
import { PageHeading, AddButton, Badge, Empty, EventRow } from '../components/ui';
export default function Overview({
  onSelect,
  onForm,
  onPage,
}: {
  onSelect: (s: Selection) => void;
  onForm: (f: FormRequest) => void;
  onPage: (p: Page) => void;
}) {
  const { data } = useWorkspace();
  if (!data) return null;
  const { overview: o, features, tasks, proposals, decisions } = data;
  const complete = o.feature_counts.implementation_complete || 0;
  const metrics = [
    {
      label: '功能总数',
      value: features.length,
      detail: `${o.feature_counts.planned} 个尚待开发`,
      icon: Boxes,
      color: 'blue',
    },
    {
      label: '开发任务',
      value: tasks.length,
      detail: `${o.task_counts.in_progress} 开发中 · ${o.task_counts.implemented} 实现完成`,
      icon: Activity,
      color: 'amber',
    },
    {
      label: '技术方案',
      value: proposals.length,
      detail: '正文修改保留独立版本',
      icon: GitPullRequest,
      color: 'purple',
    },
    {
      label: '实现完成',
      value: complete,
      detail: '仅反映功能实现进度',
      icon: CheckCircle2,
      color: 'green',
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="PROJECT OVERVIEW"
        title="工程总览"
        description="从需求到决策，让每一次工程变更有迹可循。"
      >
        <button
          className="button secondary"
          onClick={() => onSelect({ kind: 'project', id: o.project.id })}
        >
          工程设置
        </button>
        <AddButton onClick={() => onForm({ kind: 'feature' })}>新建功能</AddButton>
      </PageHeading>
      <section className="project-banner">
        <div className="banner-grid" />
        <div className="banner-content">
          <div className="banner-label">
            <span className="live-dot" /> ENGINEERING WORKSPACE{' '}
            <span className="version-tag">P0</span>
          </div>
          <h2>
            {o.project.name}
            <ArrowUpRight size={25} />
          </h2>
          <p>{o.project.description || '添加工程说明，记录目标与范围。'}</p>
          <div className="banner-meta">
            <span>
              <Flag size={14} />
              {data.milestones.length} 个里程碑
            </span>
            <span>
              <Boxes size={14} />
              {features.length} 个功能
            </span>
            <span>
              <GitPullRequest size={14} />
              {decisions.length} 个决策
            </span>
          </div>
        </div>
        <div className="banner-orbit">
          <div className="orbit-node n1">F</div>
          <div className="orbit-node n2">T</div>
          <div className="orbit-node n3">P</div>
          <div className="orbit-node n4">D</div>
          <svg viewBox="0 0 230 170">
            <path d="M48 80 L125 34 L184 88 L112 137 Z M48 80 L184 88 M125 34 L112 137" />
          </svg>
        </div>
      </section>
      <div className="metrics">
        {metrics.map((m) => (
          <div className="metric-card" key={m.label}>
            <div>
              <span>{m.label}</span>
              <div className={`metric-icon ${m.color}`}>
                <m.icon size={19} />
              </div>
            </div>
            <strong>{m.value.toString().padStart(2, '0')}</strong>
            <p>{m.detail}</p>
          </div>
        ))}
      </div>
      <div className="feature-status-summary" aria-label="功能状态统计">
        <strong>功能状态</strong>
        {Object.entries(o.feature_counts).map(([status, count]) => (
          <span key={status}>
            <Badge status={status} />
            <b>{count}</b>
          </span>
        ))}
      </div>
      <div className="verification-strip">
        <strong>工程进度</strong>
        <span className="verified-step active">已规划</span>
        <ArrowRight size={13} />
        <span className="verified-step">开发中</span>
        <ArrowRight size={13} />
        <span className="verified-step">实现完成</span>
        <div className="verification-divider" />
        <span className="unavailable">已测试 · 未提供证据</span>
        <span className="unavailable">已验收 · P1 开放</span>
      </div>
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>
              里程碑 <span>{data.milestones.length}</span>
            </h2>
            <p>阶段目标与功能实现进度</p>
          </div>
          <AddButton secondary onClick={() => onForm({ kind: 'milestone' })}>
            新建里程碑
          </AddButton>
        </div>
        <div className="milestones">
          {data.milestones.map((m, i) => {
            const children = features.filter((f) => f.milestone_id === m.id);
            const done = children.filter((f) => f.status === 'implementation_complete').length;
            return (
              <button
                className="milestone-card"
                key={m.id}
                onClick={() => onSelect({ kind: 'milestone', id: m.id })}
              >
                <div className="milestone-top">
                  <span className="milestone-index">{String(i + 1).padStart(2, '0')}</span>
                  <Badge status={m.status} />
                </div>
                <h3>{m.title}</h3>
                <p>{m.description || '阶段目标待补充'}</p>
                <div className="progress-bar">
                  <i
                    style={{ width: `${children.length ? (done / children.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="milestone-footer">
                  <span>{children.length} 个功能</span>
                  <span>
                    {done} / {children.length} 实现完成
                  </span>
                </div>
              </button>
            );
          })}
          {!data.milestones.length && (
            <Empty title="还没有里程碑" description="将目标划分为可管理的开发阶段。" />
          )}
        </div>
      </section>
      <div className="overview-columns">
        <section className="panel">
          <div className="section-header">
            <h2>
              当前开发任务 <span>{o.active_tasks.length}</span>
            </h2>
            <button className="text-button" onClick={() => onPage('board')}>
              查看看板 <ArrowRight size={14} />
            </button>
          </div>
          {o.active_tasks.length ? (
            o.active_tasks.map((t) => (
              <button
                key={t.id}
                className="entity-row"
                onClick={() => onSelect({ kind: 'task', id: t.id })}
              >
                <span>{t.title}</span>
                <Badge status={t.status} />
              </button>
            ))
          ) : (
            <Empty title="暂无进行中的任务" description="任务开始开发后，会在这里汇总。" />
          )}
          <div className="pending-heading">
            <h3>尚待处理的决策</h3>
            <span>{o.pending_decisions.length}</span>
          </div>
          {o.pending_decisions.map((d) => (
            <button
              className="pending-decision"
              key={d.id}
              onClick={() => onSelect({ kind: 'decision', id: d.id })}
            >
              <span className="decision-icon">D</span>
              <div>
                <strong>{d.title}</strong>
                <p>{features.find((f) => f.id === d.feature_id)?.code} · 待决策</p>
              </div>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!o.pending_decisions.length && <p className="muted">暂无待决策 ADR</p>}
        </section>
        <section className="panel">
          <div className="section-header">
            <h2>最近变更</h2>
            <button className="text-button" onClick={() => onPage('timeline')}>
              时间线 <ArrowRight size={14} />
            </button>
          </div>
          {o.recent_events.map((e) => (
            <EventRow key={e.id} event={e} onSelect={onSelect} compact />
          ))}
          {!o.recent_events.length && <Empty title="暂无变更记录" />}
        </section>
      </div>
    </>
  );
}
