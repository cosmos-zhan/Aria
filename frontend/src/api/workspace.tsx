import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { api } from './client';
import type { Project, WorkspaceData, Entity, Kind } from '../types';
type Store = {
  projects: Project[];
  projectId: string;
  setProjectId: (id: string) => void;
  data: WorkspaceData | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  entity: (kind: Kind, id: string) => Entity | undefined;
};
const Context = createContext<Store | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]),
    [projectId, setId] = useState(() => localStorage.getItem('projectgraph.selectedProject') || ''),
    [data, setData] = useState<WorkspaceData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const currentId = useRef(projectId),
    generation = useRef(0);
  currentId.current = projectId;
  const load = useCallback(async (id: string) => {
    const token = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const list = await api<Project[]>('/projects');
      if (token !== generation.current) return;
      setProjects(list);
      const selected = list.find((x) => x.id === id)?.id || list[0]?.id || '';
      if (selected !== currentId.current) {
        setId(selected);
        if (selected) return;
      }
      if (!selected) {
        setData(null);
        return;
      }
      const kinds = [
        'milestones',
        'features',
        'tasks',
        'proposals',
        'decisions',
        'links',
        'events',
        'graph',
        'overview',
      ] as const;
      const values = await Promise.all(
        kinds.map((kind) =>
          api(`/projects/${selected}/${kind}${kind === 'events' ? '?limit=500' : ''}`),
        ),
      );
      if (token === generation.current) {
        setData(Object.fromEntries(kinds.map((k, i) => [k, values[i]])) as WorkspaceData);
      }
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('projectgraph.selectedProject', projectId);
    setData(null);
    void load(projectId);
  }, [projectId, load]);
  const reload = useCallback(() => load(currentId.current), [load]);
  function entity(kind: Kind, id: string) {
    if (kind === 'project') return projects.find((x) => x.id === id);
    const key = (
      {
        milestone: 'milestones',
        feature: 'features',
        task: 'tasks',
        proposal: 'proposals',
        decision: 'decisions',
        link: 'links',
      } as const
    )[kind];
    return data?.[key].find((x) => x.id === id);
  }
  return (
    <Context.Provider
      value={{ projects, projectId, setProjectId: setId, data, loading, error, reload, entity }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const store = useContext(Context);
  if (!store) throw new Error('Missing WorkspaceProvider');
  return store;
}
