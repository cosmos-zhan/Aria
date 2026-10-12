# ProjectGraph P0 · Engineering Core

本项目的后续开发仓库是 [cosmos-zhan/Aria](https://github.com/cosmos-zhan/Aria)。仓库名称为 Aria，应用名称仍为 ProjectGraph。可直接克隆源码并启动：

```bash
git clone https://github.com/cosmos-zhan/Aria.git
cd Aria
./scripts/bootstrap.sh
./scripts/start.sh
```

ProjectGraph 是可在 Linux、CPU、单机环境运行的工程工作台。工程、里程碑、功能、任务、方案版本、ADR 与事件都保存在同一个 SQLite 数据库中，五个页面共享后端 API。

MiniLab 仅作为工程规划示例：9 个功能、3 个里程碑全部处于规划状态。F06 包含标记为 Demo 的方案 V1/V2、两个规划任务、依赖关联和待决策 ADR。没有执行资源采集、实验、模型调用或生成虚假的测试／验收记录。

## 快速启动

需要 Python 3.11+，从源码构建前端需要 Node.js 22.12+ 和 npm。实际验证环境为 Python 3.12.14、Node.js 24.19.0。

```bash
unzip projectgraph-p0.zip
cd projectgraph
chmod +x scripts/*.sh
./scripts/bootstrap.sh
./scripts/start.sh
```

打开 **http://127.0.0.1:8000**。API 文档为 **http://127.0.0.1:8000/docs**，健康检查为 **http://127.0.0.1:8000/api/health**。`Ctrl+C` 停止服务；再次启动会使用原数据库。

`bootstrap.sh` 创建虚拟环境、安装锁定的 Python/Node 依赖、构建前端并初始化 MiniLab。`start.sh` 运行一个 FastAPI 进程，同时提供 API 和已构建的前端。安装阶段需要联网，正常使用应用不需要模型 API 或外部服务。

ZIP 另含经过验证的 `frontend/dist`，便于直接运行；它是发布产物，不是依赖缓存，也没有提交到 Git。仅运行这个预构建版本时可以省略 Node 安装：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock.txt
.venv/bin/python scripts/seed_demo.py
./scripts/start.sh
```

## 从干净 Ubuntu 环境安装

以下以 Ubuntu 24.04+ 和 Bash 为例。其他发行版安装等价的 Python 3.11+、venv、Git、curl、unzip 即可。系统包与 Node 安装命令供复现使用；交付验证实际在云 Linux 的独立目录、新虚拟环境中完成，没有重新安装操作系统。

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv git curl unzip
python3 --version

# 如果没有符合要求的 Node，使用 nvm 安装 Node 24。
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh \
  -o /tmp/projectgraph-nvm-install.sh
bash /tmp/projectgraph-nvm-install.sh
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 24
nvm use 24
node --version
npm --version

unzip projectgraph-p0.zip
cd projectgraph
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock.txt
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python scripts/seed_demo.py
.venv/bin/python -m uvicorn app.main:app --app-dir backend \
  --host 127.0.0.1 --port 8000
```

NVM 安装方式参见 [官方说明](https://github.com/nvm-sh/nvm)。字体随前端本地打包，Linux 无中文字库也能显示中文；不请求 Google Fonts。

## 开发模式与端口

```bash
./scripts/start_dev.sh
# 前端 http://127.0.0.1:5173；API http://127.0.0.1:8000/docs

API_PORT=8010 WEB_PORT=5175 ./scripts/start_dev.sh
# 或单进程发布模式：
PORT=8080 ./scripts/start.sh
```

开发脚本使用 Linux `setsid` 管理两个服务。`Ctrl+C` 会关闭其进程组；不改变数据库。也可以分别开两个终端：

```bash
# 终端 A，项目根目录
.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload \
  --host 127.0.0.1 --port 8000

# 终端 B，项目根目录
PROJECTGRAPH_API_URL=http://127.0.0.1:8000 npm --prefix frontend run dev
```

P0 没有登录和权限控制，默认只监听本机回环地址。远程 Linux 使用 SSH 端口转发访问：`ssh -L 8000:127.0.0.1:8000 user@server`，再打开本地的 `http://127.0.0.1:8000`。

## 数据、迁移与 Seed

默认数据库是 `backend/data/projectgraph.db`；路径相对于工程文件位置确定，重启与刷新不会清空。生产数据不在 ZIP 和 Git 中。

```bash
# 使用其他数据库文件：每次启动使用同一个 URL。
export PROJECTGRAPH_DATABASE_URL="sqlite:////absolute/path/projectgraph.db"
.venv/bin/python scripts/seed_demo.py
./scripts/start.sh

# 显式执行迁移；应用启动也自动执行 upgrade head。
cd backend
../.venv/bin/python -m alembic upgrade head
../.venv/bin/python -m alembic current
cd ..

# 多次 Seed 只返回已有 MiniLab，不重复插入，不重置手工编辑。
.venv/bin/python scripts/seed_demo.py
.venv/bin/python scripts/seed_demo.py
```

迁移 `0001` 建表，`0002` 建立历史不可修改／删除、跨工程关联和删除保护触发器。`0002` 不允许破坏审计历史的 downgrade；需要回退时恢复备份。

备份前停止服务，再复制数据库文件。不要在 SQLite 写入过程中只复制主 `.db` 文件而遗漏 WAL。可在停机后使用 Python 的 SQLite backup API：

```bash
.venv/bin/python - <<'PY'
import sqlite3
with sqlite3.connect('backend/data/projectgraph.db') as source:
    with sqlite3.connect('projectgraph-backup.db') as target:
        source.backup(target)
print('Backup written: projectgraph-backup.db')
PY
```

## 使用流程

1. 从侧边栏创建或切换工程；Overview 的“工程设置”修改工程说明。
2. 创建里程碑和功能，功能编号在同一工程内唯一，例如 F01。
3. Board 切换“功能／任务”，创建任务、点击卡片编辑。任务从已规划进入开发中后，才能标记实现完成；受阻任务需先恢复开发。
4. Decisions 创建方案，其正文保存为 V1；“新增版本”填写正文及原因，生成 V2。详情中选择旧版本，或比较当前版本与上一版。
5. 创建 ADR，保存背景、多个备选项和理由。确认 ADR 时必须填写选定方案与理由；以后修改仍然创建修订，并要求修改原因。
6. Graph 查看真实外键与显式关联；按功能筛选、缩放、平移、点击节点查看详情。“创建关联”可添加任务依赖等关系，依赖环会被拒绝。
7. Timeline 按对象／事件类型过滤，点击记录查看对象和操作快照。已删除对象仍可查看事件快照。

“实现完成”不代表“已测试”或“已验收”。Task 不会自动提升 Feature 状态，P0 没有 Verified／功能 Accepted 转换。ADR 的 accepted 仅代表技术决策已确认。

删除策略：没有依赖／关联的任务、功能、里程碑可删除；存在依赖时返回 409。工程和方案采用归档，保留全部历史；ADR 不能硬删除，可通过修订标记 superseded。工程归档后只读，在普通工程列表中隐藏，可通过 `/api/projects?include_archived=true` 查询。

## 测试

```bash
# 后端：独立临时 SQLite 文件，不修改用户数据。
cd backend
../.venv/bin/python -m pytest -q
cd ..

# TypeScript 检查和实际生产构建。
npm --prefix frontend run build

# 浏览器端到端测试：独立 e2e.db，端口 8011 / 5174。
cd frontend
npx playwright install chromium --only-shell
# 若当前 Linux 缺少浏览器系统库，可使用：
# npx playwright install --with-deps chromium --only-shell
npm run test:e2e
cd ..

# 实际后端进程退出／重启，以及生产 JS/CSS/字体资源验证。
.venv/bin/python scripts/smoke_restart.py
```

浏览器测试记录保存到 `artifacts/playwright-results.json`；失败时保留 trace 与截图。`scripts/e2e_server.py` 只清理专用 `artifacts/e2e.db`。重启测试使用临时目录，结束后删除自己的测试库。E2E 所需浏览器不是日常运行依赖。

已执行结果、验收映射和未覆盖范围见 [测试报告](docs/p0-test-report.md)。截图见 [工程总览](docs/screenshots/overview.png)、[关联图谱](docs/screenshots/graph.png) 和其余截图文件。

## 目录与文档

| 路径 | 作用 |
|---|---|
| `backend/app/models`、`schemas` | 当前状态实体与输入校验 |
| `backend/app/services`、`events` | 业务约束、修订、图谱、事务事件 |
| `backend/app/api`、`main.py` | REST API、迁移启动、生产静态资源 |
| `backend/alembic`、`tests` | 数据库迁移与 26 项后端测试 |
| `frontend/src/pages`、`components` | 五页工作台、实体表单、历史和差异视图 |
| `frontend/src/api`、`types` | 统一 Client、共享工程状态、TypeScript 类型 |
| `frontend/tests` | 4 个浏览器端到端场景 |
| `scripts` | 安装、启动、Seed、真实重启验证 |
| `docs` | 架构、数据模型、API、测试、总结、截图与许可证 |
| `projectgraph-history.bundle` | 交付时导出的完整本地 Git 历史 |

- [系统架构与 P1 扩展边界](docs/architecture.md)
- [数据模型、关联与状态约束](docs/data-model.md)
- [API 文档](docs/api.md)
- [真实测试报告](docs/p0-test-report.md)
- [开发总结与提交说明](docs/development-summary.md)

## GitHub 与交付历史

后续代码以 Aria 的 `main` 分支为准。首次导入将原有 5 次本地提交保存在 `docs/history/projectgraph-p0-local-history.bundle`，对应完整日志为 `docs/history/projectgraph-p0-local-history.txt`。需要查看首次导入前的开发历史时，可单独恢复，不覆盖当前工作目录：

```bash
git clone docs/history/projectgraph-p0-local-history.bundle /tmp/projectgraph-p0-history
git -C /tmp/projectgraph-p0-history log --oneline
```

### 恢复原始 ZIP 的 Git 历史

原始 P0 ZIP 交付包不带运行缓存或 `.git` 工作目录，当时的完整历史保存在根目录 bundle。以下步骤仅用于该 ZIP，已克隆 Aria 的工作目录不需要执行。进入 ZIP 解压的项目根目录：

```bash
git init -b main
git fetch ./projectgraph-history.bundle main:refs/remotes/delivery/main
git reset --mixed refs/remotes/delivery/main
git log --oneline
```

预构建的 dist 被忽略，恢复历史不删除运行文件。若想获得独立干净 checkout：`git clone projectgraph-history.bundle projectgraph-checkout`；再按上述安装命令运行。

## 当前限制

仅支持单机 SQLite 和单用户使用；普通 CRUD 暂采用最后一次有效写入，方案与 ADR 修订有 expected_version 冲突保护。为保障版本与 Seed 一致性，P0 将短数据库事务串行化；不面向大量并发请求或大型图谱。图谱布局不会持久化，超过 1000 行的相邻版本改用双列全文比较。归档工程目前没有恢复 UI。

MiniLab 九项业务、Agent、模型 API、自动生成代码、实验执行、GPU/CUDA、Git Worktree、权限和聊天均未实现。P1 建议先加入 Test Evidence 与审批机制，再接入受约束的 Agent 工具接口。
