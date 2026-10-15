# ProjectGraph P0 实际测试报告

本文记录首次交付验证（2026-10-10）。2026-10-12 恢复到 Aria 后的独立安装与重新执行结果另见 [恢复报告](recovery-report.md)，证据存放在 `docs/evidence/recovery-2026-10-12/`。测试对象为已实现的 ProjectGraph 工程核心；MiniLab 九项业务尚未开发，测试通过的结论不适用于这些规划功能。

环境：Linux x86_64、Python 3.12.14、Node.js 24.19.0、SQLite、Chromium Headless Shell 134.0.6998.35 / Playwright 1.51.1。没有使用 GPU、CUDA 或用户本地机器。

## 实际执行结果

| 检查 | 实际执行方式 | 结果 |
|---|---|---|
| 后端数据／服务／API | `python -m pytest -q --junitxml=...`，每例使用独立临时数据库与实际迁移 | **26 passed，0 failures，0 errors**，约 2 秒 |
| 前端类型和发布构建 | `npm run build`，执行 tsc 与 Vite | **成功**，约 2.6 秒 |
| 浏览器端到端 | `npm run test:e2e`，真实 FastAPI/Vite/Chromium | **4 passed，0 skipped，0 unexpected，0 flaky**，约 14.2 秒 |
| 发布服务真实重启 | `scripts/smoke_restart.py` 启动、终止、重新启动两个 Uvicorn 进程 | **通过**，任务状态和事件历史保持一致 |
| 独立目录安装 | 将源代码复制到无 venv/node_modules/dist/数据库的目录，运行 `bootstrap.sh` | **通过**，重新安装依赖、构建、迁移、Seed 成功 |
| 独立目录真实重启 | 在新安装目录执行同一 smoke_restart 脚本 | **通过** |
| 两种启动脚本 | 实际运行 `start.sh`、`start_dev.sh`，HTTP 就绪检查后发送 SIGINT，检查所有服务端口关闭 | **通过**，后台子进程已退出 |
| Python 依赖一致性 | 新安装环境 `python -m pip check` | **No broken requirements found** |
| 前端源码格式 | `npm run format:check` | **通过** |

详细机器结果见 [verification-summary.json](evidence/verification-summary.json)。原始证据：

- [后端日志](evidence/backend-tests.log)、[JUnit XML](evidence/backend-tests.xml)
- [构建日志](evidence/frontend-build.log)
- [Playwright JSON](evidence/playwright-results.json)、[运行日志](evidence/e2e-run.log)
- [真实进程重启](evidence/restart-smoke.json)、[独立目录重启](evidence/clean-restart-smoke.json)
- [全新目录安装日志](evidence/clean-install.log)、[启动／停止脚本检查](evidence/startup-scripts.json)

最终结果同时有运行日志和 Playwright 结构化 JSON；每个场景的 results.status 均为 passed，测试进程退出码为 0。

## 后端覆盖

26 项是包含参数化反例后的实际测试数，覆盖：

- 工程 → 功能 → 方案 V1 → ADR → 任务状态 → 总览／图谱／事件的完整业务闭环。
- 方案正文通过普通 PATCH 覆盖时被拒绝；追加 V2 后 V1 内容和修改原因保持不变；过期 expected_version 返回 409。
- ADR proposed → accepted、确认后的内容修订，旧 rationale 快照仍可读取；普通 ADR PATCH 被拒绝；非法降级被拒绝。
- Task 的 verified／accepted／tested 等不支持状态被拒绝；planned 直接到 implemented 被拒绝，失败不修改状态或增加事件。
- 不存在和跨工程引用、不同 Feature 的 Proposal/ADR 引用被拒绝。
- 关联类型限制、自关联、重复关联、跨工程关联、三任务依赖环检测。
- 删除有依赖／链接的对象被拒绝；移除链接后允许删除；任务改归属必须先处理显式所有权链接。
- 数据库直接 UPDATE／DELETE Event、ProposalRevision、DecisionRevision 的六个反例均被触发器拒绝。
- 数据库复合外键和多态端点校验拒绝非法写入。
- 模拟事件追加异常后，当前状态写入回滚。
- 使用新应用实例打开同一数据库，状态／事件／方案版本保持一致；时间为 UTC `Z`；事件过滤和分页有效。
- 两次 Seed 只生成一个 MiniLab，9 个功能、3 个里程碑、规划任务和 proposed ADR 没有虚构完成记录。
- 并发追加同一个方案版本时，一个请求成功、另一个收到 409，最终只有一个 V2。
- 工程／方案归档保留历史；归档工程拒绝写入；唯一 code、空输入和空 PATCH 的校验。
- 里程碑的创建／编辑、解除归属、依赖保护与删除。

## 浏览器覆盖

| 场景 | 实际操作和断言 |
|---|---|
| MiniLab 五页 | 展示 9 个功能和四种状态的真实计数；展开 F06 的任务／方案／ADR；筛选图谱得到 5 节点和 6 条真实关联，点击节点查看详情；比较 V1/V2；时间线过滤两个 proposal.revised 事件并定位对象；核心页面无 pageerror |
| 用户完整闭环 | 通过表单新建工程、功能、任务；任务 planned → in_progress → implemented；Board 列与 Overview 数量同步；创建方案并保存 V2；V1 仍可查看；创建含备选项的 ADR 并通过修订确认；旧 proposed 修订仍可查看；图谱关系和 decision.accepted 事件匹配；刷新后恢复工程数据与方案历史 |
| 错误提示 | 创建重复 F01 返回可见错误，功能数量仍为 9；任务自关联被拒绝且显示原因 |
| 手机宽度 | 390 × 844 下总览／看板无水平溢出，侧边导航可打开并切换页面 |

截图已实际生成并检查。初次截图发现环境无中文字库，已通过本地打包 Noto Sans SC 修复，并重新执行浏览器测试：

- [Overview](screenshots/overview.png)、[Board](screenshots/board.png)、[Graph](screenshots/graph.png)
- [Decisions](screenshots/decisions.png)、[方案相邻版本比较](screenshots/proposal-history.png)
- [Timeline](screenshots/timeline.png)、[手机总览](screenshots/mobile-overview.png)

## 验收映射

| 任务书条目 | 证据 |
|---|---|
| 1. 干净环境安装启动 | 独立新目录＋新 venv＋重新 npm ci/build；bootstrap 与两种启动脚本实际运行 |
| 2. 展示 MiniLab | Seed 幂等测试＋五页浏览器场景 |
| 3. 创建工程／功能／任务 | API 闭环＋真实浏览器表单 |
| 4. 状态同步 | Board 操作与 Overview 断言；不自动提升 Feature |
| 5. V2 保留 V1 | API、数据库触发器、浏览器历史切换／刷新 |
| 6. ADR 与备选方案 | 创建／确认／再次修订 API；浏览器保存和查看旧修订 |
| 7. 真实图谱和节点详情 | 后端图谱关系集合断言＋React Flow 节点点击 |
| 8. 真实操作时间线 | 实际状态、方案与决策事件；过滤／点击定位 |
| 9. 重启保留状态和历史 | 新应用实例测试＋真实 OS 进程两次重启 |
| 10. Seed 不重复 | 两次执行检查相同 ID、工程／功能数不增加 |
| 11. 拒绝无效关联和状态 | 作用域、环、非法枚举、非法转换和数据库保护测试 |
| 12. 测试与构建成功 | Pytest 26／Playwright 4／tsc＋Vite 成功 |

额外反例四项均有实际运行证据：方案不静默覆盖、实体删除／移动不留下当前悬空关联、未测试任务不表述为已验收、刷新不丢失已保存数据。

## 已发现并处理的问题

- 云环境更新后旧 venv 的解释器路径失效：重新创建环境并按锁文件安装，独立目录安装也成功。
- 最新浏览器下载返回不完整内容：采用固定 Playwright 1.51.1，备用官方下载源成功，最终真实执行 Chromium 测试。
- TypeScript 检查发现 JSX 语法和空数组 Edge 推断问题：已修复并构建通过。
- 新建工程的刷新可能覆盖刚选择的工程：调整刷新与切换顺序，浏览器完整闭环已验证。
- 无中文字库导致截图方框：加入本地字体、保留 OFL 许可证，并重新生成截图。
- Alembic path_separator 弃用提示：已修复配置。

当前后端测试仍有 **1 条 Starlette 对 httpx TestClient 的弃用提示**，测试通过；可在后续升级测试客户端时处理。Node 测试输出中的代理配置／颜色环境提示来自执行环境，不影响结果。

## 未执行与边界

没有重新安装全新 Ubuntu VM，也没有实际在 Python 3.11、ARM64、Firefox、WebKit 或真实手机浏览器上运行。手机测试是 Chromium 改变视口，不是物理手机。没有长时间压力、多人并发编辑、公开部署和崩溃断电恢复测试；只测试了修订并发冲突和正常进程退出／重启。

没有 MiniLab 业务、真实 Agent、模型 API、CUDA／GPU、自动实验或测试证据审批引擎，不能据本报告宣称这些规划已实现或验收。
