# 开发总结

ProjectGraph P0 已实际实现、构建并运行验证。它通过结构化工程对象管理状态，提供独立持久化和五个可操作的工程视图；MiniLab 只作为规划示例。

## 已实现

- FastAPI、SQLAlchemy 2.0、Pydantic、SQLite、两个 Alembic 迁移。
- Project、Milestone、Feature、Task、Proposal、ProposalRevision、Decision、DecisionRevision、EntityLink、Event。
- 工程 CRUD、状态规则、作用域校验、依赖环检测、受保护删除／归档。
- 方案正文追加版本、相邻差异、ADR 完整历史快照和修改原因。
- 当前状态与 Event 同事务，历史表的数据库不可修改／删除保护。
- React + TypeScript + Vite + Tailwind + React Flow，统一 API Client 和共享数据。
- Overview、Board、Graph、Decisions、Timeline，可创建／编辑真实数据、操作任务状态、确认 ADR 和点击事件定位。
- 幂等 MiniLab Seed：9 个功能、3 个里程碑、F06 Demo V1/V2、备选 A/B、两个规划任务和任务依赖。
- 安装、单进程／开发启动脚本、独立真实重启验证、完整交付打包脚本。
- 26 项后端自动化测试、4 个浏览器场景、生产构建、独立目录安装、启动／停止检查和截图。

## 实际 Git 提交

| Commit | 内容 |
|---|---|
| `8a294bc` | 工程对象、SQLite、不可变修订、事务事件、服务／API／后端测试 |
| `2dc76e0` | 五页工作台、编辑表单、真实关系图、版本差异与浏览器场景 |
| `f9b6c14` | 本地中文字体、源码格式、真实进程重启验证、截图 |

交付前还提交文档、测试证据和打包脚本。2026-10-12 恢复到 Aria 时，五次本地开发提交完整保存在 [历史日志](history/projectgraph-p0-local-history.txt) 与 [Git bundle](history/projectgraph-p0-local-history.bundle)。Aria 的后续提交以远端 `main` 为准；本次恢复及重新验证见 [恢复报告](recovery-report.md)。这些是 ProjectGraph 的实际开发提交；没有为 MiniLab 虚构代码提交或功能完成状态。

## 当前限制和已知问题

- 普通实体 CRUD 没有 expected_version 乐观锁，适用于本轮单用户；Proposal／ADR 修订已提供冲突保护。
- SQLite 短事务串行化，小工程可用；大型工程的全量对象读取和布局未做规模优化。
- 图谱节点布局仅保存在当前页面；刷新会重新布局。
- 归档工程可从 API 查询，但没有恢复工程的 UI。ADR 永久保留，不能硬删除。
- 方案正文按文本展示；超过 1000 行使用双列全文，不做高成本逐行差异。
- 后端测试有一条 TestClient 弃用提示；未发现阻止 P0 运行的功能错误。
- 验证范围和未执行平台详见测试报告；正常重启通过，不等于已验证断电、磁盘损坏或大型并发。

## 未实现

任务书明确推迟的 MiniLab 九项业务、Agent/OpenCode、模型 API、自动生成代码、实验执行、资源采集、GPU/CUDA、Git Worktree、自动调度、复杂 DAG、多用户／权限、Event Sourcing 框架、AI 聊天和正式公网部署均未实现。

任务和功能的实现进度与测试／验收分开。当前不会因为手工标记 implemented 自动生成 verified／accepted 功能状态。

## 后续建议

1. 先添加 Test Evidence、验证命令、执行结果和审批实体，定义功能测试／验收的证据规则。
2. 扩展普通实体的版本冲突保护、归档恢复和图谱视图保存，保持对象与事件同事务。
3. 引入 Agent Tool Adapter，只调用受约束的业务服务，记录 actor 和执行 ID；不要让 Agent 直接写表。
4. 再选择 MiniLab 的一个小型 CPU 闭环开发，如代码结构分析与测试执行记录，使用本工作台管理方案、任务和证据。
