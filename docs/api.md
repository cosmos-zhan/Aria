# API

前缀 `/api`。JSON 请求；错误使用 `{ "detail": ... }`。输入错误／非法转换为 422，不存在对象为 404，唯一约束、依赖、归档只读或过期版本为 409。Swagger `/docs` 与 OpenAPI `/openapi.json` 是运行时完整接口定义。

## 主要接口

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/health` | 版本和健康状态；verification_enabled=false |
| GET / POST | `/api/projects` | 列表／创建；GET 可传 include_archived=true |
| GET / PATCH / DELETE | `/api/projects/{id}` | 读取／编辑／归档工程 |
| GET | `/api/projects/{id}/overview` | 实际数据库统计、任务、待决策和近期事件 |
| GET / POST | `/api/projects/{id}/milestones` | 阶段列表／创建 |
| GET / PATCH / DELETE | `/api/milestones/{id}` | 阶段 CRUD；依赖保护 |
| GET / POST | `/api/projects/{id}/features` | 功能列表／创建 |
| GET / PATCH / DELETE | `/api/features/{id}` | 功能 CRUD；依赖保护 |
| GET / POST | `/api/projects/{id}/tasks` | 任务列表／创建 |
| GET / PATCH / DELETE | `/api/tasks/{id}` | 任务 CRUD；状态转换与依赖保护 |
| GET / POST | `/api/projects/{id}/proposals` | 方案列表／创建并保存 V1 |
| GET / PATCH / DELETE | `/api/proposals/{id}` | 读取／改标题状态／归档；PATCH 禁止 content |
| GET / POST | `/api/proposals/{id}/revisions` | 版本历史／追加方案新版本 |
| GET / POST | `/api/projects/{id}/decisions` | ADR 列表／创建并保存首个修订 |
| GET / DELETE | `/api/decisions/{id}` | 读取；DELETE 明确拒绝硬删除 |
| GET / POST | `/api/decisions/{id}/revisions` | 历史／追加完整 ADR 修订；没有普通 PATCH |
| GET / POST | `/api/projects/{id}/links` | 显式关联列表／创建 |
| DELETE | `/api/links/{id}` | 移除关联并记录事件 |
| GET | `/api/projects/{id}/graph` | 真实节点和关系；可传 feature_id 过滤 |
| GET | `/api/projects/{id}/events` | 追加日志；可按 entity_type/event_type 过滤，limit 1–500，offset >= 0 |

成功创建返回 201，读取／更新返回 200，删除／归档返回 204。Proposal 新修订返回 Revision；Decision 新修订返回更新后的 Decision。列表除事件外暂不分页，适用于 P0 小工程。

## 创建与修订示例

创建 Feature（project UUID 放入路径）：

```json
{
  "code": "F01",
  "title": "分析仓库",
  "description": "规划代码结构分析",
  "milestone_id": null,
  "status": "planned"
}
```

创建 Proposal：

```json
{
  "feature_id": "<feature-uuid>",
  "title": "资源采集接口方案",
  "status": "candidate",
  "content": "V1：统一 ResourceProvider 接口。",
  "change_reason": "初始规划"
}
```

`POST /api/proposals/{id}/revisions`，旧版本仍保留：

```json
{
  "expected_version": 1,
  "content": "V2：将 CPU 和未来 GPU provider 分离。",
  "change_reason": "明确 CPU-only 边界"
}
```

创建或修订 ADR 的内容字段：

```json
{
  "feature_id": "<feature-uuid>",
  "proposal_id": "<proposal-uuid>",
  "title": "统一资源接口",
  "context": "需要为未来扩展保留接口边界。",
  "alternatives": [
    { "title": "接口统一", "description": "测试边界明确。" },
    { "title": "直接命令调用", "description": "原型实现简单。" }
  ],
  "selected_option": "接口统一",
  "rationale": "符合单机 CPU-only 的阶段目标。",
  "status": "accepted",
  "change_reason": "确认技术选择"
}
```

修改 ADR 时用 revisions 接口、提交完整内容，再加 `expected_version`。不得变更已有 ADR 的所属功能／关联方案。

任务依赖：

```json
{
  "source_type": "task",
  "source_id": "<dependent-task-uuid>",
  "target_type": "task",
  "target_id": "<prerequisite-task-uuid>",
  "relation_type": "depends_on"
}
```

`source` 依赖 `target`，并不意味着 P0 会自动调度执行任务。

## 事件和图谱

Event payload 保存 `before`、`after` 或 `revision`，actor_type 为 user 或 seed。API 仅允许读事件；没有更新、删除或手工伪造 Event 的公开接口。

Graph 返回 `{nodes, edges}`。节点带 entity_type、entity_id、data；边带 source、target、relation_type、origin 和可空 link_id。节点 ID 为 `type:UUID`。真实外键边的 origin 是 database，显式关联为 link；前端没有写死 Demo 关系。

P0 不提供鉴权、对外服务限流或多用户冲突处理。默认仅在本机使用；后续接入 Agent 应调用这些服务边界，不能绕过约束直接写表。
