export type Kind = 'project' | 'milestone' | 'feature' | 'task' | 'proposal' | 'decision' | 'link';
export type Entity = {
  id: string;
  project_id?: string;
  title?: string;
  name?: string;
  description?: string;
  status?: string;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
};
export type Project = Entity & { name: string; description: string; archived: boolean };
export type Milestone = Entity & {
  title: string;
  description: string;
  order: number;
  status: string;
};
export type Feature = Entity & {
  code: string;
  title: string;
  description: string;
  milestone_id: string | null;
  status: string;
};
export type Task = Entity & {
  feature_id: string;
  title: string;
  description: string;
  status: string;
};
export type Proposal = Entity & { feature_id: string; title: string; status: string };
export type Alternative = { title: string; description: string };
export type Decision = Entity & {
  feature_id: string;
  proposal_id: string | null;
  title: string;
  context: string;
  alternatives: Alternative[];
  selected_option: string;
  rationale: string;
  status: string;
  version: number;
};
export type Revision = {
  id: string;
  proposal_id: string;
  version: number;
  content: string;
  change_reason: string;
  created_at: string;
};
export type DecisionRevision = {
  id: string;
  decision_id: string;
  version: number;
  snapshot: Decision;
  change_reason: string;
  created_at: string;
};
export type Link = Entity & {
  source_type: Kind;
  source_id: string;
  target_type: Kind;
  target_id: string;
  relation_type: string;
};
export type EngineeringEvent = {
  id: string;
  project_id: string;
  entity_type: Kind;
  entity_id: string;
  event_type: string;
  actor_type: string;
  occurred_at: string;
  payload: {
    after?: Entity;
    before?: Entity;
    revision?: Revision | DecisionRevision;
    [key: string]: unknown;
  };
};
export type GraphData = {
  nodes: { id: string; entity_type: Kind; entity_id: string; data: Entity }[];
  edges: {
    id: string;
    source: string;
    target: string;
    relation_type: string;
    link_id: string | null;
    origin: string;
  }[];
};
export type OverviewData = {
  project: Project;
  milestones: Milestone[];
  feature_counts: Record<string, number>;
  task_counts: Record<string, number>;
  active_tasks: Task[];
  pending_decisions: Decision[];
  recent_events: EngineeringEvent[];
  verification: { available: boolean; tested: null; accepted: null; note: string };
};
export type WorkspaceData = {
  milestones: Milestone[];
  features: Feature[];
  tasks: Task[];
  proposals: Proposal[];
  decisions: Decision[];
  links: Link[];
  events: EngineeringEvent[];
  graph: GraphData;
  overview: OverviewData;
};
export type Selection = { kind: Kind; id: string; event?: EngineeringEvent };
export type Page = 'overview' | 'board' | 'graph' | 'decisions' | 'timeline';
export const labels: Record<string, string> = {
  planned: '已规划',
  in_progress: '开发中',
  blocked: '受阻',
  implemented: '实现完成',
  implementation_complete: '实现完成',
  draft: '草案',
  candidate: '候选方案',
  selected: '已选方案',
  archived: '已归档',
  proposed: '待决策',
  accepted: '已确认 ADR',
  rejected: '已否决',
  superseded: '已取代',
};
export const kindLabels: Record<Kind, string> = {
  project: '工程',
  milestone: '里程碑',
  feature: '功能',
  task: '任务',
  proposal: '方案',
  decision: 'ADR',
  link: '关联',
};
export const eventLabels: Record<string, string> = {
  'project.created': '创建工程',
  'project.updated': '更新工程',
  'project.archived': '归档工程',
  'milestone.created': '创建里程碑',
  'milestone.updated': '更新里程碑',
  'milestone.status_changed': '变更里程碑状态',
  'milestone.deleted': '删除里程碑',
  'feature.created': '创建功能',
  'feature.updated': '更新功能',
  'feature.status_changed': '变更功能状态',
  'feature.deleted': '删除功能',
  'task.created': '添加任务',
  'task.updated': '更新任务',
  'task.status_changed': '变更任务状态',
  'task.deleted': '删除任务',
  'proposal.created': '创建方案',
  'proposal.updated': '更新方案',
  'proposal.revised': '新增方案版本',
  'proposal.status_changed': '变更方案状态',
  'proposal.archived': '归档方案',
  'decision.created': '保存 ADR',
  'decision.revised': '修订 ADR',
  'decision.accepted': '确认技术决策',
  'link.created': '创建工程关联',
  'link.deleted': '移除工程关联',
};
export const transitions: Record<string, Record<string, string[]>> = {
  task: {
    planned: ['in_progress', 'blocked'],
    in_progress: ['planned', 'blocked', 'implemented'],
    blocked: ['planned', 'in_progress'],
    implemented: ['in_progress'],
  },
  feature: {
    planned: ['in_progress', 'blocked'],
    in_progress: ['planned', 'blocked', 'implementation_complete'],
    blocked: ['planned', 'in_progress'],
    implementation_complete: ['in_progress'],
  },
  milestone: {
    planned: ['in_progress', 'blocked'],
    in_progress: ['planned', 'blocked', 'implementation_complete'],
    blocked: ['planned', 'in_progress'],
    implementation_complete: ['in_progress'],
  },
  proposal: {
    draft: ['candidate', 'archived'],
    candidate: ['draft', 'selected', 'archived'],
    selected: ['candidate', 'archived'],
    archived: ['draft'],
  },
  decision: {
    proposed: ['accepted', 'rejected', 'superseded'],
    accepted: ['superseded'],
    rejected: ['proposed', 'superseded'],
    superseded: [],
  },
};
export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
