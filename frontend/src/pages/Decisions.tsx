import { useState } from 'react';
import { ArrowUpRight, GitBranch, Scale, FileText } from 'lucide-react';
import { useWorkspace } from '../api/workspace';
import { PageHeading, AddButton, Badge, Empty } from '../components/ui';
import type { Selection } from '../types';
import type { FormRequest } from '../components/EntityForm';
export default function Decisions({
  onSelect,
  onForm,
}: {
  onSelect: (s: Selection) => void;
  onForm: (r: FormRequest) => void;
}) {
  const { data } = useWorkspace();
  const [filter, setFilter] = useState('');
  if (!data) return null;
  const proposals = data.proposals.filter((p) => !filter || p.feature_id === filter),
    decisions = data.decisions.filter((d) => !filter || d.feature_id === filter);
  return (
    <>
      <PageHeading
        eyebrow="PROPOSALS & DECISIONS"
        title="方案与技术决策"
        description="保留每版方案，记录选择的背景、备选路径和理由。"
      >
        <AddButton
          secondary
          onClick={() => onForm({ kind: 'proposal', featureId: filter || undefined })}
        >
          新建方案
        </AddButton>
        <AddButton onClick={() => onForm({ kind: 'decision', featureId: filter || undefined })}>
          新建 ADR
        </AddButton>
      </PageHeading>
      <div className="decision-intro">
        <Scale size={22} />
        <p>方案负责探索，ADR 负责记录正式选择。每次修订都有独立版本与修改原因。</p>
        <select
          aria-label="决策功能筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">全部功能</option>
          {data.features.map((f) => (
            <option value={f.id} key={f.id}>
              {f.code} · {f.title}
            </option>
          ))}
        </select>
      </div>
      <div className="decisions-columns">
        <section>
          <div className="section-header">
            <h2>
              <GitBranch size={18} />
              技术方案 <span>{proposals.length}</span>
            </h2>
            <span className="section-caption">PROPOSALS</span>
          </div>
          {proposals.map((p) => {
            const f = data.features.find((f) => f.id === p.feature_id);
            return (
              <article className="proposal-card" key={p.id}>
                <div className="proposal-top">
                  <span className="object-code">{f?.code}</span>
                  <Badge status={p.status} />
                </div>
                <button
                  className="proposal-title"
                  onClick={() => onSelect({ kind: 'proposal', id: p.id })}
                >
                  {p.title}
                  <ArrowUpRight size={18} />
                </button>
                <p>{f?.title}</p>
                <div className="proposal-footer">
                  <button
                    className="text-button"
                    onClick={() => onSelect({ kind: 'proposal', id: p.id })}
                  >
                    <FileText size={14} />
                    查看版本与差异
                  </button>
                  <button
                    className="text-button"
                    disabled={p.status === 'archived'}
                    onClick={() => onForm({ kind: 'proposal', entity: p, mode: 'revision' })}
                  >
                    新增版本
                  </button>
                </div>
              </article>
            );
          })}
          {!proposals.length && (
            <Empty title="还没有技术方案" description="为一个功能记录实现路径和候选方案。" />
          )}
        </section>
        <section>
          <div className="section-header">
            <h2>
              <Scale size={18} />
              正式工程决策 <span>{decisions.length}</span>
            </h2>
            <span className="section-caption">ADR REGISTER</span>
          </div>
          {decisions.map((d) => {
            const f = data.features.find((f) => f.id === d.feature_id);
            return (
              <article className="decision-card" key={d.id}>
                <div className="proposal-top">
                  <span className="object-code">ADR · V{d.version}</span>
                  <Badge status={d.status} />
                </div>
                <button
                  className="proposal-title"
                  onClick={() => onSelect({ kind: 'decision', id: d.id })}
                >
                  {d.title}
                  <ArrowUpRight size={18} />
                </button>
                <p className="decision-context">{d.context}</p>
                <div className="decision-options">
                  {d.alternatives.map((a, i) => (
                    <span key={i}>
                      {String.fromCharCode(65 + i)} · {a.title}
                    </span>
                  ))}
                </div>
                <div className="proposal-footer">
                  <span>
                    {f?.code} · {f?.title}
                  </span>
                  <button
                    className="text-button"
                    disabled={d.status === 'superseded'}
                    onClick={() => onForm({ kind: 'decision', entity: d, mode: 'revision' })}
                  >
                    {d.status === 'proposed' ? '确认 / 修订' : '新增修订'}
                  </button>
                </div>
              </article>
            );
          })}
          {!decisions.length && (
            <Empty title="还没有 ADR" description="保存技术选择与理由，让后续开发了解决策背景。" />
          )}
        </section>
      </div>
    </>
  );
}
