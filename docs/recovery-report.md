# Aria / ProjectGraph P0 仓库恢复报告

恢复日期：2026-10-12。目标为 Linux、CPU、单机运行的 Engineering Core。

## 远端核对与缺失范围

检查 GitHub 的 README、递归提交树、提交列表、分支、全部 PR／Issue、Release 与 Tag：

- `main` 原 HEAD 为 `1630bbd58355481fc2378b44afcf766109e7b780`，消息为 `docs: initialize Aria with ProjectGraph P0 setup instructions`。
- 只有一个提交和一个分支；提交树只有 `README.md`（10,868 字节）。没有其他 PR、Issue、Release 或 Tag 可用于恢复代码。
- GitHub 仓库 API 当时返回 size=5 KB；此元数据不是源码完整性证据，确认缺失以提交树为准。
- README 所引用的后端、前端、迁移、依赖文件、脚本、测试、截图、文档和历史归档均未实际上传。此前保留的本地版本有 106 个 tracked 文件，因此其中 105 个文件缺失。

恢复来源为本地原有 ProjectGraph 开发仓库的 `d65d2c27f585acfe65a1609c76615ffcff0b6a4f`。导入全部受版本控制的源码和交付文档，保留脚本执行权限；运行数据库、venv、node_modules 和 dist 由安装过程重建。原有五次本地开发提交另保存在 [日志](history/projectgraph-p0-local-history.txt) 和 [完整 Git bundle](history/projectgraph-p0-local-history.bundle)，不改写 Aria 的初始提交。

## 恢复后的可运行范围

| 路径 | 已提供内容 |
|---|---|
| `backend/app` | FastAPI、SQLAlchemy／SQLite、输入验证、工程／里程碑／功能／任务、方案与 ADR 版本、关联、事务事件 |
| `backend/alembic` | 建表迁移、不可变历史与关联完整性保护 |
| `backend/tests` | 27 项真实数据库／服务／API 测试，包含启动日志回归 |
| `frontend/src` | Overview、Board、Graph、Decisions、Timeline，统一后端 API 与共享工程状态 |
| `frontend/tests` | 四个真实 Chromium 端到端场景 |
| `scripts` | 锁定依赖安装、两种启动方式、幂等 Seed、真实 HTTP／重启／并发读取、启动退出检查、打包 |
| `docs` | 架构、数据模型、API、使用与测试报告、许可证、截图、本次证据与开发历史 |

工程状态和事件在同一事务中持久化；方案／ADR 保留旧修订，依赖环和跨工程关联会被拒绝。MiniLab 的九项业务仍是规划示例；没有 Agent、模型调用、自动代码生成、资源监控或实验执行。手工标记实现完成不会生成测试或验收结论。

## 本次重新执行结果

使用无 venv、node_modules、dist 或数据库的独立 Git checkout，实际执行 `./scripts/bootstrap.sh`。验证环境为 Linux x86_64、Python 3.12.14、Node.js 24.19.0；浏览器为 Playwright 1.51.1／Chromium Headless Shell 134.0.6998.35。

| 检查 | 实际结果 | 证据 |
|---|---|---|
| 全新依赖安装、前端类型检查／生产构建、迁移与 Seed | 通过 | [安装／构建日志](evidence/recovery-2026-10-12/clean-install.log) |
| 后端测试 | **27 passed**；0 failures／errors，1 条 TestClient 弃用提示 | [日志](evidence/recovery-2026-10-12/backend-tests.log)、[JUnit](evidence/recovery-2026-10-12/backend-tests.xml) |
| Chromium 端到端 | **4 passed**；0 skipped／unexpected／flaky | [日志](evidence/recovery-2026-10-12/e2e-run.log)、[JSON](evidence/recovery-2026-10-12/playwright-results.json) |
| 生产前端、JS／CSS／字体、CRUD、Seed、正常进程重启 | 通过，任务状态与事件历史保持一致 | [重启结果](evidence/recovery-2026-10-12/restart-smoke.json) |
| 真实 HTTP 并发读取 | 9 个 worker，180 次工程数据读取，全部成功 | 同上；复现代码为 `scripts/smoke_restart.py` |
| `start.sh` 与 `start_dev.sh` | 就绪后发送 SIGINT；父子服务端口均关闭 | [启动检查](evidence/recovery-2026-10-12/startup-scripts.json)；复现代码为 `scripts/smoke_startup.py` |
| Python 依赖一致性 | No broken requirements found | [日志](evidence/recovery-2026-10-12/dependency-check.log) |

机器摘要见 [verification-summary.json](evidence/recovery-2026-10-12/verification-summary.json)。`docs/evidence/` 根目录保留的是 2026-10-10 首次交付证据，本次证据独立存放，避免混淆日期。

## 恢复中发现的情况与修正

1. 环境最初没有 Chromium，四个浏览器场景未能启动。安装锁定版本的浏览器后重跑；[首次日志](evidence/recovery-2026-10-12/e2e-initial-missing-browser.log) 与 [浏览器安装日志](evidence/recovery-2026-10-12/browser-install.log) 保留。
2. 首次实际浏览器运行有两个场景因数据读取返回 500 而失败。发现嵌入式 Alembic 会重配日志并禁用服务日志，现改为仅独立 CLI 配置日志，增加回归测试。最初 500 的独立触发条件未能定位；最终四场景及额外 180 次并发读取没有复现，不能据此证明日志配置是 500 的根因。[失败日志](evidence/recovery-2026-10-12/e2e-before-fix.log) 保留。
3. 下一次运行发现任务创建测试在保存尚未完成时点击表单的“关闭”，随后完成保存又打开详情，导致点击被弹窗阻挡。测试现在等待已保存任务的详情后再关闭，没有缩减业务断言。[等待修正前日志](evidence/recovery-2026-10-12/e2e-before-save-wait.log) 保留。
4. README 的默认启动入口改为实际 Git clone；ZIP／预构建 dist 说明仅适用于独立发布包。补入此前只有引用而缺失的五次开发历史归档，并增加可重复执行的启动／SIGINT 检查。

## 从仓库运行与复核

```bash
git clone https://github.com/cosmos-zhan/Aria.git
cd Aria
./scripts/bootstrap.sh
./scripts/start.sh
# 浏览器打开 http://127.0.0.1:8000；Ctrl+C 停止。
```

```bash
.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run build
npm --prefix frontend exec -- playwright install chromium --only-shell
npm --prefix frontend run test:e2e
.venv/bin/python scripts/smoke_restart.py
.venv/bin/python scripts/smoke_startup.py
```

测试使用临时库或专用 `artifacts/e2e.db`，不清理应用数据库。测试浏览器不是日常运行依赖。

本次没有重装 Ubuntu VM，也没有验证 ARM、Python 3.11、真实手机、断电恢复、长时间负载、多用户或公网部署。当前版本适用于单用户的小型工程；完整边界见 [架构文档](architecture.md) 与 [原测试报告](p0-test-report.md)。
