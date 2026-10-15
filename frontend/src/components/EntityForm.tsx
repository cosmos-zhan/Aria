import { useState, useEffect, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../api/workspace';
import { api, post, patch } from '../api/client';
import {
  kindLabels,
  labels,
  transitions,
  type Kind,
  type Entity,
  type Alternative,
  type Revision,
} from '../types';
import { Modal } from './ui';
export type FormRequest = { kind: Kind; entity?: Entity; featureId?: string; mode?: 'revision' };
const plurals: Record<Kind, string> = {
  project: 'projects',
  milestone: 'milestones',
  feature: 'features',
  task: 'tasks',
  proposal: 'proposals',
  decision: 'decisions',
  link: 'links',
};
export function EntityForm({
  request,
  onClose,
  onSaved,
}: {
  request: FormRequest;
  onClose: () => void;
  onSaved: (kind: Kind, entity: Entity) => void;
}) {
  const { kind, entity, featureId, mode } = request;
  const { projectId, data, reload, setProjectId } = useWorkspace();
  const revision = mode === 'revision';
  const [v, setV] = useState<Record<string, string>>({
    name: String(entity?.name || ''),
    title: String(entity?.title || ''),
    description: String(entity?.description || ''),
    code: String(entity?.code || ''),
    order: String(entity?.order ?? data?.milestones.length ?? 0),
    feature_id: String(entity?.feature_id || featureId || data?.features[0]?.id || ''),
    milestone_id: String(entity?.milestone_id || ''),
    proposal_id: String(entity?.proposal_id || ''),
    status: String(
      entity?.status ||
        (kind === 'proposal' ? 'draft' : kind === 'decision' ? 'proposed' : 'planned'),
    ),
    content: '',
    context: String(entity?.context || ''),
    selected_option: String(entity?.selected_option || ''),
    rationale: String(entity?.rationale || ''),
    change_reason: revision ? '' : '初始规划',
  });
  const [alternatives, setAlternatives] = useState<Alternative[]>(
    (entity?.alternatives as Alternative[]) || [],
  );
  const [version, setVersion] = useState<number>(Number(entity?.version || 0));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fetching, setFetching] = useState(revision && kind === 'proposal');
  const set = (name: string, value: string) => setV((old) => ({ ...old, [name]: value }));
  useEffect(() => {
    if (revision && kind === 'proposal' && entity) {
      let canceled = false;
      api<Revision[]>(`/proposals/${entity.id}/revisions`)
        .then((rows) => {
          if (!canceled) {
            const last = rows.at(-1)!;
            setV((old) => ({ ...old, content: last.content }));
            setVersion(last.version);
            setFetching(false);
          }
        })
        .catch((e) => {
          if (!canceled) {
            setError(e.message);
            setFetching(false);
          }
        });
      return () => {
        canceled = true;
      };
    }
  }, [revision, kind, entity]);
  const text = (
    name: string,
    label: string,
    required = false,
    textarea = false,
    placeholder = '',
  ) => (
    <label className="field" key={name}>
      <span>
        {label}
        {required && <em> *</em>}
      </span>
      {textarea ? (
        <textarea
          aria-label={label}
          value={v[name]}
          onChange={(e) => set(name, e.target.value)}
          required={required}
          rows={name === 'content' ? 8 : 3}
          maxLength={100000}
          placeholder={placeholder}
        />
      ) : (
        <input
          aria-label={label}
          value={v[name]}
          onChange={(e) => set(name, e.target.value)}
          required={required}
          maxLength={name === 'code' ? 40 : name === 'change_reason' ? 4000 : 160}
          placeholder={placeholder}
          pattern={name === 'code' ? '[A-Za-z0-9_-]{1,40}' : undefined}
        />
      )}
    </label>
  );
  const statusOptions = entity
    ? [entity.status!, ...(transitions[kind]?.[entity.status!] || [])]
    : kind === 'proposal'
      ? ['draft', 'candidate']
      : kind === 'decision'
        ? ['proposed', 'accepted']
        : ['planned'];
  const selectStatus = (
    <label className="field">
      <span>状态</span>
      <select aria-label="状态" value={v.status} onChange={(e) => set('status', e.target.value)}>
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {labels[s]}
          </option>
        ))}
      </select>
    </label>
  );
  const chooseFeature = (
    <label className="field">
      <span>所属功能 *</span>
      <select
        aria-label="所属功能"
        value={v.feature_id}
        onChange={(e) => {
          set('feature_id', e.target.value);
          set('proposal_id', '');
        }}
        required
        disabled={kind === 'decision' && !!entity}
      >
        {data?.features.map((f) => (
          <option value={f.id} key={f.id}>
            {f.code} · {f.title}
          </option>
        ))}
      </select>
    </label>
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let body: Record<string, unknown> = {};
      if (kind === 'project') body = { name: v.name.trim(), description: v.description };
      if (kind === 'milestone')
        body = {
          title: v.title.trim(),
          description: v.description,
          order: Number(v.order),
          status: v.status,
        };
      if (kind === 'feature')
        body = {
          code: v.code.trim(),
          title: v.title.trim(),
          description: v.description,
          milestone_id: v.milestone_id || null,
          status: v.status,
        };
      if (kind === 'task')
        body = {
          title: v.title.trim(),
          description: v.description,
          feature_id: v.feature_id,
          status: v.status,
        };
      if (kind === 'proposal')
        body = revision
          ? { content: v.content, change_reason: v.change_reason.trim(), expected_version: version }
          : entity
            ? { title: v.title.trim(), status: v.status }
            : {
                title: v.title.trim(),
                feature_id: v.feature_id,
                status: v.status,
                content: v.content,
                change_reason: v.change_reason.trim(),
              };
      if (kind === 'decision')
        body = {
          title: v.title.trim(),
          feature_id: v.feature_id,
          proposal_id: v.proposal_id || null,
          context: v.context,
          alternatives,
          selected_option: v.selected_option,
          rationale: v.rationale,
          status: v.status,
          change_reason: v.change_reason.trim(),
          ...(entity ? { expected_version: version } : {}),
        };
      if (
        kind === 'decision' &&
        v.status === 'accepted' &&
        (!v.selected_option.trim() || !v.rationale.trim())
      )
        throw new Error('确认 ADR 时，请填写选定方案与决策理由。');
      const result = entity
        ? revision || kind === 'decision'
          ? await post<Entity>(`/${plurals[kind]}/${entity.id}/revisions`, body)
          : await patch<Entity>(`/${plurals[kind]}/${entity.id}`, body)
        : await post<Entity>(
            kind === 'project' ? '/projects' : `/projects/${projectId}/${plurals[kind]}`,
            body,
          );
      await reload();
      if (kind === 'project' && !entity) setProjectId(result.id);
      onSaved(kind, revision && kind === 'proposal' ? entity! : result);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = `${revision ? '新增版本 · ' : entity ? '编辑 · ' : '新建 · '}${kindLabels[kind]}`;
  return (
    <Modal
      title={title}
      subtitle={
        revision || (kind === 'decision' && entity)
          ? '保存为新的历史修订；旧版本保持可查看。'
          : '保存后更新全部工程视图并追加事件。'
      }
      onClose={onClose}
      wide={kind === 'decision' || kind === 'proposal'}
    >
      <form onSubmit={submit} className="entity-form">
        {kind === 'project' ? (
          <>
            {text('name', '工程名称', true)}
            {text('description', '工程说明', false, true)}
          </>
        ) : (
          <>
            {!revision && text('title', '标题', true)}
            {(kind === 'task' || (kind === 'proposal' && !entity) || kind === 'decision') &&
              chooseFeature}
            {kind === 'feature' && (
              <div className="form-grid">
                {text('code', '功能编号', true, false, '如 F10')}
                <label className="field">
                  <span>里程碑</span>
                  <select
                    aria-label="里程碑"
                    value={v.milestone_id}
                    onChange={(e) => set('milestone_id', e.target.value)}
                  >
                    <option value="">未分配</option>
                    {data?.milestones.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {['feature', 'task', 'milestone'].includes(kind) &&
              text('description', '描述', false, true)}
            {kind === 'milestone' && (
              <label className="field">
                <span>排序</span>
                <input
                  aria-label="排序"
                  type="number"
                  min="0"
                  max="10000"
                  value={v.order}
                  onChange={(e) => set('order', e.target.value)}
                />
              </label>
            )}
            {!revision && kind !== 'decision' && selectStatus}
            {kind === 'proposal' && (!entity || revision) && (
              <>
                {text('content', '方案正文', true, true, '用文本或 Markdown 描述方案')}
                {text('change_reason', '修改原因', true)}
              </>
            )}
            {kind === 'decision' && (
              <>
                <div className="form-grid">
                  <label className="field">
                    <span>关联方案</span>
                    <select
                      aria-label="关联方案"
                      value={v.proposal_id}
                      onChange={(e) => set('proposal_id', e.target.value)}
                      disabled={!!entity}
                    >
                      <option value="">无关联方案</option>
                      {data?.proposals
                        .filter((p) => p.feature_id === v.feature_id)
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  {selectStatus}
                </div>
                {text('context', '决策背景', true, true)}
                <div className="field">
                  <span>备选方案</span>
                  <div className="alternatives-editor">
                    {alternatives.map((a, i) => (
                      <div className="alternative-input" key={i}>
                        <input
                          aria-label={`备选方案 ${i + 1} 名称`}
                          value={a.title}
                          required
                          maxLength={160}
                          placeholder="方案名称"
                          onChange={(e) =>
                            setAlternatives((old) =>
                              old.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                            )
                          }
                        />
                        <textarea
                          aria-label={`备选方案 ${i + 1} 说明`}
                          value={a.description}
                          placeholder="优点、成本与约束"
                          onChange={(e) =>
                            setAlternatives((old) =>
                              old.map((x, j) =>
                                j === i ? { ...x, description: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`移除备选方案 ${i + 1}`}
                          onClick={() => setAlternatives((old) => old.filter((_, j) => i !== j))}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setAlternatives((old) => [...old, { title: '', description: '' }])
                      }
                      disabled={alternatives.length >= 20}
                    >
                      <Plus size={14} />
                      添加备选方案
                    </button>
                  </div>
                </div>
                {text('selected_option', '选定方案', v.status === 'accepted')}
                {text('rationale', '决策理由', v.status === 'accepted', true)}
                {text('change_reason', '修改原因', true)}
                <div className="form-note">
                  “已确认 ADR”表示技术选择已记录；不代表功能已测试或已验收。
                </div>
              </>
            )}
          </>
        )}
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="button"
            disabled={busy || fetching || (revision && kind === 'proposal' && !version)}
          >
            {busy ? '保存中…' : fetching ? '加载版本…' : revision ? `保存 V${version + 1}` : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function LinkForm({ onClose }: { onClose: () => void }) {
  const { data, projectId, reload } = useWorkspace();
  const [relation, setRelation] = useState('depends_on'),
    [source, setSource] = useState(''),
    [target, setTarget] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const sourceType =
    relation === 'depends_on' ? 'task' : relation === 'informs' ? 'proposal' : 'feature';
  const targetType =
    relation === 'depends_on'
      ? 'task'
      : relation === 'has_task'
        ? 'task'
        : relation === 'has_proposal'
          ? 'proposal'
          : 'decision';
  const pool = (kind: string) =>
    kind === 'task'
      ? data?.tasks
      : kind === 'proposal'
        ? data?.proposals
        : kind === 'decision'
          ? data?.decisions
          : data?.features;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post(`/projects/${projectId}/links`, {
        source_type: sourceType,
        source_id: source,
        target_type: targetType,
        target_id: target,
        relation_type: relation,
      });
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="创建工程关联"
      subtitle="仅允许同工程有效对象；任务依赖不得成环。"
      onClose={onClose}
    >
      <form className="entity-form" onSubmit={submit}>
        <label className="field">
          <span>关系类型</span>
          <select
            aria-label="关系类型"
            value={relation}
            onChange={(e) => {
              setRelation(e.target.value);
              setSource('');
              setTarget('');
            }}
          >
            <option value="depends_on">Task → Task · 依赖</option>
            <option value="informs">Proposal → ADR · 支撑决策</option>
            <option value="has_task">Feature → Task · 包含任务</option>
            <option value="has_proposal">Feature → Proposal · 包含方案</option>
            <option value="has_decision">Feature → ADR · 包含决策</option>
          </select>
        </label>
        {[
          { key: 'source', label: '源对象', value: source, set: setSource, type: sourceType },
          { key: 'target', label: '目标对象', value: target, set: setTarget, type: targetType },
        ].map((x) => (
          <label className="field" key={x.key}>
            <span>{x.label} *</span>
            <select
              aria-label={x.label}
              required
              value={x.value}
              onChange={(e) => x.set(e.target.value)}
            >
              <option value="">选择{x.label}</option>
              {pool(x.type)?.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
        ))}
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button" disabled={busy}>
            保存关联
          </button>
        </div>
      </form>
    </Modal>
  );
}
