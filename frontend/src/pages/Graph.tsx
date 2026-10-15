import { useState, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type NodeProps,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network, Link2 } from 'lucide-react';
import { useWorkspace } from '../api/workspace';
import { kindLabels, type Selection, type Kind } from '../types';
import { PageHeading, Badge, Empty } from '../components/ui';
const colors: Record<string, string> = {
  feature: '#648494',
  task: '#d4a466',
  proposal: '#8e80b0',
  decision: '#65a98e',
};
const symbols: Record<string, string> = { feature: 'F', task: 'T', proposal: 'P', decision: 'D' };
type EngineeringNode = Node<
  { title: string; kind: Kind; status: string; code: string },
  'engineering'
>;
function ObjectNode({ data }: NodeProps<EngineeringNode>) {
  return (
    <div className={`graph-node kind-${data.kind}`}>
      <Handle type="target" position={Position.Left} />
      <div className="graph-node-header">
        <span className="graph-kind-icon">{symbols[data.kind]}</span>
        <span>{kindLabels[data.kind]}</span>
        <small>{data.code}</small>
      </div>
      <strong>{data.title}</strong>
      <Badge status={data.status} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { engineering: ObjectNode };
const relationLabels: Record<string, string> = {
  has_task: '包含任务',
  has_proposal: '包含方案',
  has_decision: '记录决策',
  informs: '支撑决策',
  depends_on: '依赖',
};
export default function Graph({
  onSelect,
  onLink,
}: {
  onSelect: (s: Selection) => void;
  onLink: () => void;
}) {
  const { data } = useWorkspace();
  const [filter, setFilter] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<EngineeringNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const filtered = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    const ns = data.graph.nodes.filter(
      (n) =>
        !filter ||
        (n.entity_type === 'feature' ? n.entity_id === filter : n.data.feature_id === filter),
    );
    const ids = new Set(ns.map((n) => n.id));
    return {
      nodes: ns,
      edges: data.graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    };
  }, [data, filter]);
  useEffect(() => {
    const rows: Record<string, number> = {};
    setNodes(
      filtered.nodes.map((n) => {
        const col = { feature: 0, task: 1, proposal: 2, decision: 3 }[
          n.entity_type as 'feature' | 'task' | 'proposal' | 'decision'
        ];
        const row = rows[n.entity_type] || 0;
        rows[n.entity_type] = row + 1;
        return {
          id: n.id,
          type: 'engineering',
          position: { x: col * 300 + 20, y: row * 170 + 20 },
          data: {
            title: String(n.data.title),
            kind: n.entity_type,
            status: String(n.data.status),
            code: String(n.data.code || n.entity_id.slice(0, 6)),
          },
        };
      }),
    );
    setEdges(
      filtered.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: relationLabels[e.relation_type] || e.relation_type,
        animated: e.relation_type === 'depends_on',
        style: {
          stroke: e.relation_type === 'depends_on' ? '#c59a65' : '#aab7bd',
          strokeWidth: 1.4,
        },
        labelStyle: { fill: '#667981', fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#aab7bd' },
      })),
    );
  }, [filtered, setNodes, setEdges]);
  if (!data) return null;
  return (
    <>
      <PageHeading
        eyebrow="ENGINEERING GRAPH"
        title="工程关联图谱"
        description="查看真实对象关系，沿着功能、任务与技术选择追溯工程。"
      >
        <button className="button secondary" onClick={onLink}>
          <Link2 size={16} />
          创建关联
        </button>
      </PageHeading>
      <div className="graph-toolbar">
        <div className="graph-legend">
          {(['feature', 'task', 'proposal', 'decision'] as Kind[]).map((k) => (
            <span key={k}>
              <i style={{ background: colors[k] }} />
              {kindLabels[k]}
            </span>
          ))}
        </div>
        <label>
          <span>范围</span>
          <select
            aria-label="图谱功能筛选"
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
        </label>
      </div>
      <div className="graph-canvas">
        {nodes.length ? (
          <ReactFlow
            key={filter}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              const [kind, id] = node.id.split(':');
              onSelect({ kind: kind as Kind, id });
            }}
            onEdgeClick={(_, edge) => {
              const e = data.graph.edges.find((e) => e.id === edge.id);
              if (e?.link_id) onSelect({ kind: 'link', id: e.link_id });
              else if (e) {
                const [kind, id] = e.target.split(':');
                onSelect({ kind: kind as Kind, id });
              }
            }}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.2}
            maxZoom={1.8}
            nodesConnectable={false}
            deleteKeyCode={null}
          >
            <Background gap={20} size={1} color="#d9e0e3" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => colors[String(n.data.kind)] || '#aaa'}
              maskColor="rgba(243,246,248,.6)"
              pannable
              zoomable
            />
            <div className="graph-caption">
              <Network size={13} />
              {nodes.length} 个对象 · {edges.length} 条关联
            </div>
          </ReactFlow>
        ) : (
          <Empty title="暂无工程对象" description="创建功能后，工程关系会自动出现在这里。" />
        )}
      </div>
      <div className="graph-footnote">
        <span>点击对象查看详情 · 拖动排列 · 滚轮缩放</span>
        <span>连线来自数据库关系与 EntityLink；布局调整只影响当前视图。</span>
      </div>
    </>
  );
}
