import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  CheckSquare,
  Plus,
  GitBranch,
  GitPullRequest,
} from 'lucide-react';
import { useWorkspace } from '../api/workspace';
import { patch } from '../api/client';
import { transitions, labels, type Selection, type Feature } from '../types';
import { PageHeading, AddButton, Badge, Empty } from '../components/ui';
import type { FormRequest } from '../components/EntityForm';
export default function Board({
  onSelect,
  onForm,
}: {
  onSelect: (s: Selection) => void;
  onForm: (r: FormRequest) => void;
}) {
  const { data, reload } = useWorkspace();
  const [tab, setTab] = useState<'features' | 'tasks'>('features'),
    [filter, setFilter] = useState(''),
    [query, setQuery] = useState(''),
    [expanded, setExpanded] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  if (!data) return null;
  const columns =
    tab === 'features'
      ? ['planned', 'in_progress', 'blocked', 'implementation_complete']
      : ['planned', 'in_progress', 'blocked', 'implemented'];
  const items = (tab === 'features' ? data.features : data.tasks).filter(
    (e) =>
      (!filter ||
        (tab === 'features' ? (e as Feature).milestone_id === filter : e.feature_id === filter)) &&
      e.title.toLowerCase().includes(query.toLowerCase()),
  );
  async function changeTask(id: string, status: string) {
    setBusy(id);
    setError('');
    try {
      await patch(`/tasks/${id}`, { status });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="DEVELOPMENT BOARD"
        title="功能与任务看板"
        description="组织需求、拆解任务，并明确记录实现进度。"
      >
        <AddButton secondary onClick={() => onForm({ kind: 'feature' })}>
          新建功能
        </AddButton>
        <AddButton onClick={() => onForm({ kind: 'task' })}>新建任务</AddButton>
      </PageHeading>
      <div className="board-toolbar">
        <div className="segmented">
          <button
            className={tab === 'features' ? 'active' : ''}
            onClick={() => {
              setTab('features');
              setFilter('');
            }}
          >
            <Layers size={15} />
            功能 <span>{data.features.length}</span>
          </button>
          <button
            className={tab === 'tasks' ? 'active' : ''}
            onClick={() => {
              setTab('tasks');
              setFilter('');
            }}
          >
            <CheckSquare size={15} />
            任务 <span>{data.tasks.length}</span>
          </button>
        </div>
        <div className="toolbar-inputs">
          <input
            aria-label="搜索看板"
            placeholder="搜索标题…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select aria-label="看板筛选" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{tab === 'features' ? '全部里程碑' : '全部功能'}</option>
            {(tab === 'features' ? data.milestones : data.features).map((e) => (
              <option value={e.id} key={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <div className="board-columns">
        {columns.map((status) => (
          <section className={`board-column column-${status}`} key={status}>
            <div className="column-header">
              <span className={`status-dot status-${status}`} />
              <h2>{labels[status]}</h2>
              <span>{items.filter((e) => e.status === status).length}</span>
            </div>
            <div className="column-body">
              {items
                .filter((e) => e.status === status)
                .map((item) => {
                  const isFeature = tab === 'features',
                    feature = isFeature
                      ? (item as Feature)
                      : data.features.find((f) => f.id === item.feature_id),
                    tasks = data.tasks.filter((t) => t.feature_id === item.id),
                    milestone = data.milestones.find((m) => m.id === feature?.milestone_id);
                  return (
                    <article className="board-card" key={item.id}>
                      <div className="card-eyebrow">
                        <span>{feature?.code || 'TASK'}</span>
                        <span>{milestone?.title.split('·')[0] || '未分配'}</span>
                      </div>
                      <button
                        className="card-title"
                        onClick={() =>
                          onSelect({ kind: isFeature ? 'feature' : 'task', id: item.id })
                        }
                      >
                        {item.title}
                      </button>
                      {item.description && <p className="card-description">{item.description}</p>}
                      {isFeature ? (
                        <>
                          <div className="card-counts">
                            <span>
                              <CheckSquare size={13} />
                              {tasks.length}
                            </span>
                            <span>
                              <GitBranch size={13} />
                              {data.proposals.filter((p) => p.feature_id === item.id).length}
                            </span>
                            <span>
                              <GitPullRequest size={13} />
                              {data.decisions.filter((d) => d.feature_id === item.id).length}
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`展开 ${feature?.code}`}
                              onClick={() => setExpanded((x) => (x === item.id ? '' : item.id))}
                            >
                              {expanded === item.id ? (
                                <ChevronUp size={15} />
                              ) : (
                                <ChevronDown size={15} />
                              )}
                            </button>
                          </div>
                          {expanded === item.id && (
                            <div className="card-expanded">
                              <small>{milestone?.title || '未分配里程碑'}</small>
                              {tasks.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => onSelect({ kind: 'task', id: t.id })}
                                >
                                  {t.title}
                                  <Badge status={t.status} />
                                </button>
                              ))}
                              {data.proposals
                                .filter((p) => p.feature_id === item.id)
                                .map((p) => (
                                  <button
                                    key={p.id}
                                    onClick={() => onSelect({ kind: 'proposal', id: p.id })}
                                  >
                                    {p.title}
                                    <Badge status={p.status} />
                                  </button>
                                ))}
                              {data.decisions
                                .filter((d) => d.feature_id === item.id)
                                .map((d) => (
                                  <button
                                    key={d.id}
                                    onClick={() => onSelect({ kind: 'decision', id: d.id })}
                                  >
                                    {d.title}
                                    <Badge status={d.status} />
                                  </button>
                                ))}
                              <button
                                className="text-button"
                                onClick={() => onForm({ kind: 'task', featureId: item.id })}
                              >
                                <Plus size={13} />
                                添加任务
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <select
                          className="task-status"
                          aria-label={`任务状态 ${item.title}`}
                          disabled={busy === item.id}
                          value={item.status}
                          onChange={(e) => void changeTask(item.id, e.target.value)}
                        >
                          {[item.status, ...transitions.task[item.status]].map((s) => (
                            <option value={s} key={s}>
                              {labels[s]}
                            </option>
                          ))}
                        </select>
                      )}
                    </article>
                  );
                })}
              {!items.some((e) => e.status === status) && (
                <div className="column-empty">暂无{tab === 'features' ? '功能' : '任务'}</div>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="board-footnote">
        实现完成仅表示开发进度。已测试与已验收需要独立证据，P0 暂不支持这些转换。
      </div>
      {!data.features.length && (
        <Empty title="先创建一个功能" description="随后可以为功能拆分任务、创建方案和记录决策。" />
      )}
    </>
  );
}
