import { useState, useEffect } from 'react';
import { History, Filter } from 'lucide-react';
import { useWorkspace } from '../api/workspace';
import { api } from '../api/client';
import {
  kindLabels,
  eventLabels,
  type Selection,
  type Kind,
  type EngineeringEvent,
} from '../types';
import { PageHeading, Empty, EventRow } from '../components/ui';
export default function Timeline({ onSelect }: { onSelect: (s: Selection) => void }) {
  const { data, projectId } = useWorkspace();
  const [kind, setKind] = useState(''),
    [eventType, setEventType] = useState(''),
    [rows, setRows] = useState<EngineeringEvent[]>([]),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let stop = false;
    setBusy(true);
    setError('');
    const q = new URLSearchParams({
      limit: '100',
      ...(kind ? { entity_type: kind } : {}),
      ...(eventType ? { event_type: eventType } : {}),
    });
    api<EngineeringEvent[]>(`/projects/${projectId}/events?${q}`)
      .then((r) => {
        if (!stop) {
          setRows(r);
          setMore(r.length === 100);
        }
      })
      .catch((e) => {
        if (!stop) setError(e.message);
      })
      .finally(() => {
        if (!stop) setBusy(false);
      });
    return () => {
      stop = true;
    };
  }, [projectId, kind, eventType, data?.events]);
  async function loadMore() {
    setBusy(true);
    try {
      const q = new URLSearchParams({
        limit: '100',
        offset: String(rows.length),
        ...(kind ? { entity_type: kind } : {}),
        ...(eventType ? { event_type: eventType } : {}),
      });
      const r = await api<EngineeringEvent[]>(`/projects/${projectId}/events?${q}`);
      setRows((x) => [...x, ...r]);
      setMore(r.length === 100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  let lastDate = '';
  return (
    <>
      <PageHeading
        eyebrow="ENGINEERING HISTORY"
        title="工程变更时间线"
        description="每一次正式修改都留下记录，历史事件不可编辑或删除。"
      >
        <span className="append-tag">
          <History size={14} />
          APPEND ONLY
        </span>
      </PageHeading>
      <div className="timeline-toolbar">
        <span>
          <Filter size={16} />
          筛选记录
        </span>
        <select
          aria-label="对象类型"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setEventType('');
          }}
        >
          <option value="">全部对象类型</option>
          {Object.entries(kindLabels).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="事件类型"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          <option value="">全部事件类型</option>
          {Object.entries(eventLabels)
            .filter(([k]) => !kind || k.startsWith(kind + '.'))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v} · {k}
              </option>
            ))}
        </select>
        <span className="timeline-count">已加载 {rows.length} 条记录</span>
      </div>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      <section className="timeline-list">
        {rows.map((e) => {
          const date = new Date(e.occurred_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          const header = date !== lastDate;
          lastDate = date;
          return (
            <div key={e.id}>
              {header && <h2 className="timeline-date">{date}</h2>}
              <EventRow event={e} onSelect={onSelect} />
            </div>
          );
        })}
        {!rows.length && !busy && (
          <Empty title="没有匹配的工程事件" description="调整筛选，或创建工程对象生成真实记录。" />
        )}
        {busy && <p className="muted">加载记录…</p>}
        {more && (
          <button
            className="button secondary load-more"
            disabled={busy}
            onClick={() => void loadMore()}
          >
            加载更多
          </button>
        )}
      </section>
      <p className="timeline-footnote">
        时间根据当前浏览器环境显示；事件在数据库中以 UTC 保存。点击记录查看对应对象及操作快照。
      </p>
    </>
  );
}
