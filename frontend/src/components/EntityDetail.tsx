import { useState, useEffect } from 'react';
import { GitBranch, Pencil, Plus, Trash2, ChevronDown } from 'lucide-react';
import { useWorkspace } from '../api/workspace';
import { api, remove } from '../api/client';
import {
  kindLabels,
  formatDate,
  type Selection,
  type Revision,
  type DecisionRevision,
  type Proposal,
  type Decision,
  type Entity,
  type Kind,
} from '../types';
import { Modal, Badge, EntityButton } from './ui';
import type { FormRequest } from './EntityForm';
export function EntityDetail({
  selection,
  onClose,
  onSelect,
  onForm,
}: {
  selection: Selection;
  onClose: () => void;
  onSelect: (s: Selection) => void;
  onForm: (r: FormRequest) => void;
}) {
  const { entity, data, reload } = useWorkspace();
  const { kind, id } = selection;
  const obj = entity(kind, id);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const snapshot = selection.event?.payload.after || selection.event?.payload.before;
  const shown = obj || snapshot;
  async function deleting() {
    setBusy(true);
    setError('');
    try {
      await remove(
        `/${{ project: 'projects', milestone: 'milestones', feature: 'features', task: 'tasks', proposal: 'proposals', decision: 'decisions', link: 'links' }[kind]}/${id}`,
      );
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  const showRelated = (label: string, k: Kind, objects: Entity[]) =>
    objects.length > 0 && (
      <section className="detail-section">
        <h3>
          {label}
          <span>{objects.length}</span>
        </h3>
        {objects.map((item) => (
          <EntityButton
            entity={item}
            key={item.id}
            onClick={() => onSelect({ kind: k, id: item.id })}
          />
        ))}
      </section>
    );
  if (!shown)
    return (
      <Modal title="历史工程事件" onClose={onClose}>
        <div className="detail-body">
          <p>该对象已删除；下面保留了操作时的事件快照。</p>
          <pre className="text-content">{JSON.stringify(selection.event?.payload, null, 2)}</pre>
        </div>
      </Modal>
    );
  const featureId = kind === 'feature' ? id : String(shown.feature_id || '');
  const feature = data?.features.find((f) => f.id === featureId);
  const milestone = data?.milestones.find((m) => m.id === shown.milestone_id);
  return (
    <Modal
      title={kindLabels[kind] + '详情'}
      subtitle={`${kind.toUpperCase()} · ${id.slice(0, 8)}`}
      onClose={onClose}
      wide
    >
      <div className="detail-body">
        <div className="detail-title">
          <div>
            {kind === 'feature' && <span className="object-code">{String(shown.code)}</span>}
            <h2>{shown.title || shown.name || '工程关联'}</h2>
          </div>
          {shown.status && <Badge status={shown.status} />}
        </div>
        {!obj && <div className="notice">对象已删除。当前显示删除前的事件快照，历史仍然保留。</div>}
        {shown.description && <p className="detail-description">{shown.description}</p>}
        <div className="detail-meta">
          {feature && kind !== 'feature' && (
            <button onClick={() => onSelect({ kind: 'feature', id: feature.id })}>
              {feature.code} · {feature.title}
            </button>
          )}
          {milestone && (
            <button onClick={() => onSelect({ kind: 'milestone', id: milestone.id })}>
              {milestone.title}
            </button>
          )}
          <span>创建 {formatDate(shown.created_at)}</span>
        </div>
        {obj && (
          <div className="detail-actions">
            {kind !== 'link' && (
              <button
                className="button secondary"
                disabled={kind === 'decision' && obj.status === 'superseded'}
                onClick={() =>
                  onForm({ kind, entity: obj, mode: kind === 'decision' ? 'revision' : undefined })
                }
              >
                <Pencil size={15} />
                {kind === 'decision' ? '修订 ADR' : '编辑'}
              </button>
            )}
            {kind === 'feature' && (
              <>
                <button
                  className="button secondary"
                  onClick={() => onForm({ kind: 'task', featureId: id })}
                >
                  <Plus size={15} />
                  新建任务
                </button>
                <button
                  className="button secondary"
                  onClick={() => onForm({ kind: 'proposal', featureId: id })}
                >
                  <Plus size={15} />
                  新建方案
                </button>
              </>
            )}
            {kind === 'proposal' && (
              <button
                className="button"
                disabled={obj.status === 'archived'}
                onClick={() => onForm({ kind, entity: obj, mode: 'revision' })}
              >
                <GitBranch size={15} />
                新增版本
              </button>
            )}
            {kind !== 'decision' && (
              <button className="button ghost-danger" onClick={() => setConfirm(true)}>
                <Trash2 size={14} />
                {kind === 'project' || kind === 'proposal'
                  ? '归档'
                  : kind === 'link'
                    ? '移除关联'
                    : '删除'}
              </button>
            )}
          </div>
        )}
        {confirm && (
          <div className="confirm-box">
            <span>
              {kind === 'project' || kind === 'proposal'
                ? '归档后仍保留历史记录。'
                : '仅删除没有依赖和关联的对象，事件历史保留。'}
            </span>
            <button className="button danger" disabled={busy} onClick={deleting}>
              {busy ? '处理中…' : '确认操作'}
            </button>
            <button className="text-button" onClick={() => setConfirm(false)}>
              取消
            </button>
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {kind === 'feature' && (
          <>
            {showRelated('开发任务', 'task', data?.tasks.filter((t) => t.feature_id === id) || [])}
            {showRelated(
              '技术方案',
              'proposal',
              data?.proposals.filter((p) => p.feature_id === id) || [],
            )}
            {showRelated(
              '工程决策',
              'decision',
              data?.decisions.filter((d) => d.feature_id === id) || [],
            )}
          </>
        )}
        {kind === 'milestone' &&
          showRelated(
            '阶段功能',
            'feature',
            data?.features.filter((f) => f.milestone_id === id) || [],
          )}
        {kind === 'proposal' && obj && <ProposalHistory proposal={obj as Proposal} />}
        {kind === 'decision' && obj && (
          <DecisionHistory decision={obj as Decision} onSelect={onSelect} />
        )}
        {kind === 'link' && (
          <section className="detail-section">
            <h3>关联端点</h3>
            {['source', 'target'].map((side) => {
              const k = String(shown[`${side}_type`]) as Kind,
                item = entity(k, String(shown[`${side}_id`]));
              return item ? (
                <EntityButton
                  key={side}
                  entity={item}
                  onClick={() => onSelect({ kind: k, id: item.id })}
                >
                  {side === 'source' ? '源：' : '目标：'}
                  {item.title}
                </EntityButton>
              ) : null;
            })}
            <p className="mono">{String(shown.relation_type)}</p>
          </section>
        )}
        {obj && data && (
          <section className="detail-section">
            <h3>显式工程关联</h3>
            {data.links
              .filter((l) => l.source_id === id || l.target_id === id)
              .map((l) => (
                <EntityButton
                  key={l.id}
                  entity={l}
                  onClick={() => onSelect({ kind: 'link', id: l.id })}
                >
                  {l.relation_type} · {entity(l.source_type, l.source_id)?.title} →{' '}
                  {entity(l.target_type, l.target_id)?.title}
                </EntityButton>
              ))}
            {!data.links.some((l) => l.source_id === id || l.target_id === id) && (
              <p className="muted">暂无额外关联；所属功能等基础关系由数据库外键维护。</p>
            )}
          </section>
        )}
        {selection.event && (
          <details className="event-snapshot">
            <summary>本次操作的事件快照</summary>
            <pre className="text-content">{JSON.stringify(selection.event.payload, null, 2)}</pre>
          </details>
        )}
      </div>
    </Modal>
  );
}
export function ProposalHistory({ proposal }: { proposal: Proposal }) {
  const [revisions, setRevisions] = useState<Revision[]>([]),
    [selected, setSelected] = useState(0),
    [compare, setCompare] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let stop = false;
    setRevisions([]);
    setError('');
    api<Revision[]>(`/proposals/${proposal.id}/revisions`)
      .then((rows) => {
        if (!stop) {
          setRevisions(rows);
          setSelected(rows.length - 1);
        }
      })
      .catch((e) => {
        if (!stop) setError(e.message);
      });
    return () => {
      stop = true;
    };
  }, [proposal.id, proposal.updated_at]);
  const current = revisions[selected],
    previous = revisions[selected - 1];
  return (
    <section className="detail-section">
      <div className="section-header">
        <h3>
          方案版本 <span>{revisions.length}</span>
        </h3>
        {current && (
          <select
            aria-label="方案版本"
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {revisions.map((r, i) => (
              <option key={r.id} value={i}>
                V{r.version} · {formatDate(r.created_at)}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <div className="error-box">{error}</div>}
      {current ? (
        <>
          <div className="revision-reason">
            <GitBranch size={14} />
            <strong>V{current.version}</strong>
            <span>{current.change_reason}</span>
          </div>
          <div className="version-toolbar">
            <button
              className={`text-button ${compare ? 'active' : ''}`}
              disabled={!previous}
              onClick={() => setCompare((x) => !x)}
            >
              {compare ? '查看正文' : '比较相邻版本'}
              {previous ? ` · V${previous.version} → V${current.version}` : ''}
            </button>
            <span>历史版本只读</span>
          </div>
          {compare && previous ? (
            <TextDiff before={previous.content} after={current.content} />
          ) : (
            <pre className="text-content proposal-content">{current.content}</pre>
          )}
        </>
      ) : (
        <p className="muted">加载历史版本…</p>
      )}
    </section>
  );
}
function TextDiff({ before, after }: { before: string; after: string }) {
  const a = before.split('\n'),
    b = after.split('\n');
  if (a.length > 1000 || b.length > 1000)
    return (
      <div className="diff-columns">
        <pre className="text-content">{before}</pre>
        <pre className="text-content">{after}</pre>
      </div>
    );
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const lines: { type: string; line: string }[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ type: 'same', line: a[i] });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || table[i + 1][j] >= table[i][j + 1])) {
      lines.push({ type: 'removed', line: a[i++] });
    } else {
      lines.push({ type: 'added', line: b[j++] });
    }
  }
  return (
    <div className="diff-view" aria-label="相邻版本差异">
      {lines.map((l, k) => (
        <div className={`diff-line ${l.type}`} key={k}>
          <span>{l.type === 'removed' ? '−' : l.type === 'added' ? '+' : ' '}</span>
          <code>{l.line || ' '}</code>
        </div>
      ))}
    </div>
  );
}
export function DecisionHistory({
  decision,
  onSelect,
}: {
  decision: Decision;
  onSelect: (s: Selection) => void;
}) {
  const [history, setHistory] = useState<DecisionRevision[]>([]),
    [selected, setSelected] = useState(-1),
    [error, setError] = useState('');
  const { data } = useWorkspace();
  useEffect(() => {
    let stop = false;
    setHistory([]);
    setError('');
    api<DecisionRevision[]>(`/decisions/${decision.id}/revisions`)
      .then((rows) => {
        if (!stop) {
          setHistory(rows);
          setSelected(rows.length - 1);
        }
      })
      .catch((e) => {
        if (!stop) setError(e.message);
      });
    return () => {
      stop = true;
    };
  }, [decision.id, decision.version]);
  const revision = history[selected],
    d = revision?.snapshot || decision,
    proposal = data?.proposals.find((p) => p.id === d.proposal_id);
  return (
    <section className="detail-section">
      <div className="section-header">
        <h3>
          ADR 内容与历史 <span>V{d.version}</span>
        </h3>
        <select
          aria-label="ADR 版本"
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {history.map((r, i) => (
            <option value={i} key={r.id}>
              V{r.version} · {formatDate(r.created_at)}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="error-box">{error}</div>}
      {revision && (
        <div className="revision-reason">
          <GitBranch size={14} />
          <span>{revision.change_reason}</span>
          <Badge status={d.status} />
        </div>
      )}
      {proposal && (
        <EntityButton
          entity={proposal}
          onClick={() => onSelect({ kind: 'proposal', id: proposal.id })}
        >
          关联方案：{proposal.title}
        </EntityButton>
      )}
      <div className="adr-content">
        <h4>背景</h4>
        <p>{d.context}</p>
        <h4>备选方案</h4>
        {d.alternatives.length ? (
          d.alternatives.map((a, i) => (
            <div className="alternative-card" key={i}>
              <span>{String.fromCharCode(65 + i)}</span>
              <div>
                <strong>{a.title}</strong>
                <p>{a.description || '未补充说明'}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">未记录备选方案</p>
        )}
        <h4>选定方案</h4>
        <p>{d.selected_option || '待定'}</p>
        <h4>理由</h4>
        <p>{d.rationale || '待补充'}</p>
        <div className="form-note">技术决策的确认不表示测试或功能验收完成。</div>
      </div>
      <details className="history-list">
        <summary>
          全部修订原因 <ChevronDown size={14} />
        </summary>
        {history.map((r, i) => (
          <button key={r.id} onClick={() => setSelected(i)}>
            <strong>V{r.version}</strong>
            <span>{r.change_reason}</span>
            <small>{formatDate(r.created_at)}</small>
          </button>
        ))}
      </details>
    </section>
  );
}
