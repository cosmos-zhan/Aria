import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Columns3,
  Network,
  GitPullRequest,
  History,
  Plus,
  RefreshCw,
  ChevronDown,
  ArrowUpRight,
  Box,
  Menu,
} from 'lucide-react';
import { useWorkspace } from './api/workspace';
import type { Page, Selection, Entity, Kind } from './types';
import Overview from './pages/Overview';
import Board from './pages/Board';
import Graph from './pages/Graph';
import Decisions from './pages/Decisions';
import Timeline from './pages/Timeline';
import { EntityForm, LinkForm, type FormRequest } from './components/EntityForm';
import { EntityDetail } from './components/EntityDetail';
import { Empty } from './components/ui';
const nav = [
  { id: 'overview', label: 'Overview', zh: '工程总览', icon: LayoutDashboard },
  { id: 'board', label: 'Board', zh: '功能看板', icon: Columns3 },
  { id: 'graph', label: 'Graph', zh: '工程图谱', icon: Network },
  { id: 'decisions', label: 'Decisions', zh: '方案与决策', icon: GitPullRequest },
  { id: 'timeline', label: 'Timeline', zh: '变更时间线', icon: History },
] as const;
const validPages = new Set(nav.map((n) => n.id));
function hashPage(): Page {
  const p = location.hash.replace('#', '') as Page;
  return validPages.has(p) ? p : 'overview';
}
export default function App() {
  const { projects, projectId, setProjectId, data, loading, error, reload } = useWorkspace();
  const [page, setPage] = useState<Page>(hashPage),
    [selection, setSelection] = useState<Selection | null>(null),
    [form, setForm] = useState<FormRequest | null>(null),
    [linkForm, setLinkForm] = useState(false),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState('');
  const project = projects.find((p) => p.id === projectId);
  function go(p: Page) {
    location.hash = p;
    setPage(p);
    setMobile(false);
  }
  useEffect(() => {
    const handler = () => setPage(hashPage());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    setSelection(null);
    setForm(null);
    setLinkForm(false);
  }, [projectId]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(''), 3500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const closeForm = useCallback(() => setForm(null), []),
    closeDetail = useCallback(() => setSelection(null), []),
    closeLink = useCallback(() => setLinkForm(false), []);
  function saved(kind: Kind, entity: Entity) {
    setToast('已保存 · 工程视图与事件已更新');
    if (kind !== 'project') setSelection({ kind, id: entity.id });
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-symbol">
            <Network size={23} />
          </div>
          <div>
            <strong>ProjectGraph</strong>
            <span>ENGINEERING WORKBENCH</span>
          </div>
        </div>
        <div className="workspace-label">
          WORKSPACE <span>P0</span>
        </div>
        <div className="project-switch">
          <span className="project-avatar">{project?.name.slice(0, 1) || 'P'}</span>
          <select
            aria-label="当前工程"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.length ? (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            ) : (
              <option value="">选择工程</option>
            )}
          </select>
          <ChevronDown size={14} />
        </div>
        <button className="new-project" onClick={() => setForm({ kind: 'project' })}>
          <Plus size={14} />
          新建工程
        </button>
        <div className="nav-label">ENGINEERING</div>
        <nav>
          {nav.map((n) => (
            <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => go(n.id)}>
              <n.icon size={18} />
              <span>
                {n.label}
                <small>{n.zh}</small>
              </span>
              {n.id === 'decisions' && data && data.overview.pending_decisions.length > 0 && (
                <em>{data.overview.pending_decisions.length}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="core-card">
            <span className="core-icon">
              <Box size={16} />
            </span>
            <div>
              <strong>Engineering Core</strong>
              <p>结构化对象 · 可追溯历史</p>
            </div>
          </div>
          <div className="local-status">
            <i />
            Local workspace<span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="mobile-toggle icon-button"
              aria-label="菜单"
              onClick={() => setMobile((x) => !x)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{project?.name || 'ProjectGraph'}</strong>
            <span className="topbar-project-tag">PROJECT</span>
          </div>
          <div className="topbar-right">
            <span className="cpu-tag">
              <i />
              CPU ONLY
            </span>
            <button
              className={`icon-button ${loading ? 'spinning' : ''}`}
              aria-label="刷新工程数据"
              disabled={loading}
              onClick={() => void reload()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <main>
          {error ? (
            <div className="error-box" role="alert">
              <strong>无法读取工程数据</strong>
              <p>{error}</p>
              <button className="button secondary" onClick={() => void reload()}>
                重试
              </button>
            </div>
          ) : !data ? (
            loading ? (
              <div className="loading-state">
                <Network size={30} />
                <p>正在读取工程数据…</p>
              </div>
            ) : (
              <Empty
                title="创建你的第一个工程"
                description="从功能需求出发，逐步组织任务、方案与工程决策。"
                action={
                  <button className="button" onClick={() => setForm({ kind: 'project' })}>
                    <Plus size={16} />
                    新建工程
                  </button>
                }
              />
            )
          ) : (
            <>
              {page === 'overview' && (
                <Overview onSelect={setSelection} onForm={setForm} onPage={go} />
              )}{' '}
              {page === 'board' && <Board onSelect={setSelection} onForm={setForm} />}{' '}
              {page === 'graph' && (
                <Graph onSelect={setSelection} onLink={() => setLinkForm(true)} />
              )}{' '}
              {page === 'decisions' && <Decisions onSelect={setSelection} onForm={setForm} />}{' '}
              {page === 'timeline' && <Timeline onSelect={setSelection} />}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            ProjectGraph <span>·</span> Engineering Core
          </span>
          <span>
            工程状态来自统一数据库 <ArrowUpRight size={12} />
          </span>
        </footer>
      </div>
      {selection && !form && (
        <EntityDetail
          selection={selection}
          onClose={closeDetail}
          onSelect={setSelection}
          onForm={setForm}
        />
      )}{' '}
      {form && (
        <EntityForm
          key={`${form.kind}:${form.entity?.id || 'new'}:${form.mode}`}
          request={form}
          onClose={closeForm}
          onSaved={saved}
        />
      )}{' '}
      {linkForm && <LinkForm onClose={closeLink} />}{' '}
      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}
