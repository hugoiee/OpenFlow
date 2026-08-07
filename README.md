# OpenFlow

节点式 AI 工作流画布编辑器：支持多个项目，每个项目是一块画布，在画布上添加节点并用连线编排。节点按输出形态分三类：

- **文本**：Prompt 节点 + **Any LLM 节点**（把上游文本喂给一个 OpenAI 兼容模型产出文本，可作下游节点的 prompt）
- **图像**：**Image 2**、**Nano Banana** 生成节点
- **视频**：**Seedance** 生成节点

图像与视频均已接入真实生成（经后端代理调 AIGC 接口，绕开 CORS）。此外还提供：

- **画布 Agent 聊天面板**：用自然语言描述想法，后端调 LLM 产出计划，前端自动落成「Prompt 节点 → 图像节点」并连线、建生图任务。
- **素材节点**：从桌面**拖图像/音频到画布空白处**上传，在落点生成素材节点，再连线喂给下游图像/视频节点作输入。
- **分组 / 整理**：选中多个节点右键，可**分组**（建容器节点包住、一起移动/改名）或**整理**（网格排列）。
- **Prompt 预设库**：全局共享的常用 / System 提示词，Prompt 节点可一键选用或「存为预设」。
- **结果下载**（图像/视频卡片经后端同源代理拉流）、**深色模式**、**应用内「设置」面板**（配置调用方署名、各端点、Agent 接口）。

技术栈与形态：

- **前端**：Vite + React 19 + React Flow + shadcn/ui（端口 5173）
- **后端**：Hono + better-sqlite3（端口 8787），数据存 SQLite；AIGC 调用经后端代理
- **桌面端**：Electron 外壳（内嵌后端，可打包 mac / win 安装包）
- **结构**：pnpm workspaces monorepo
- 单用户、无鉴权

---

## 仓库结构

```
apps/web/        前端（Vite + React + React Flow + shadcn/ui）      @openflow/web
apps/server/     后端（Hono + better-sqlite3）                      @openflow/server
apps/desktop/    桌面端外壳（Electron，打包 mac/win 安装包）           @openflow/desktop
packages/shared/ 前后端共享的纯 TS 类型/常量                          @openflow/shared
```

---

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| **Xcode 命令行工具** | 最新 | 提供 `git` 与原生模块 `better-sqlite3` 的编译工具链 |
| **Node.js** | **≥ 22**（推荐 22 LTS） | Vite 8 / better-sqlite3 11 / `node:sqlite` 回退均需要 |
| **pnpm** | **≥ 9**（推荐 10+） | 包管理器（lockfile v9） |

---

## 安装步骤

### 1. 安装系统依赖

```bash
# 命令行工具（git + 编译工具链）
xcode-select --install

# Homebrew（若未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js 22
brew install node@22 && brew link --overwrite --force node@22

# pnpm（用 Node 自带的 corepack）
corepack enable && corepack prepare pnpm@latest --activate
```

验证：

```bash
node -v   # ≥ v22
pnpm -v   # ≥ 9
```

> `better-sqlite3` 为原生模块，依赖上面的命令行工具编译。若编译报错可补装 `brew install python`；仍失败也会自动回退到 Node 22 内置的 `node:sqlite`。

### 2. 拉取代码并安装项目依赖

```bash
git clone <仓库地址> OpenFlow
cd OpenFlow
pnpm install
```

### 3. 启动

```bash
pnpm dev:all     # 同时起前端(5173) + 后端(8787)
```

打开 http://localhost:5173 即可使用。

> 📖 前端界面怎么用（新建项目、加节点、连线、生图/生视频、画布 Agent 等）见 **[docs/操作指南.md](docs/操作指南.md)**。

- **首次启动会弹出阻断弹窗，需先填写调用方署名 `req_from` 才能进入**（图像/视频生成与文件上传统一用此署名，存后端）。
- 图像/视频生成、上传、画布 Agent、Any LLM 的**接口地址与 Key 在应用内「设置」面板配置**（顶栏齿轮图标）。
- 数据库文件会自动生成在 `apps/server/data/openflow.db`（已 gitignore）。

---

## 常用命令（仓库根运行）

```bash
pnpm dev:all     # 前端 + 后端
pnpm dev         # 只起前端
pnpm server      # 只起后端
pnpm build       # 全包构建
pnpm typecheck   # 全包类型检查
pnpm lint        # 全包 lint
pnpm format      # Prettier 格式化 apps/*/src 与 packages/*/src
```

---

## 桌面端打包（Electron）

桌面端把 `@openflow/server` 内嵌进 Electron 主进程（同进程跑 Hono，生产环境顺带托管前端产物），窗口加载本地 `http://localhost`（固定端口 42617，被占用才回退随机），因此前端相对 `/api` 调用零改动可用。数据库落 `userData` 目录。

```bash
# mac：产 dmg/zip（arm64 + x64/Intel，未签名）到 apps/desktop/release
pnpm --filter @openflow/desktop dist:mac

# win：产 nsis 安装包（x64，未签名；在 mac 上交叉构建）
pnpm --filter @openflow/desktop dist:win

# Electron 开发（自动切 ABI + 连 Vite dev server:5173）
pnpm --filter @openflow/desktop dev
```

- **原生模块 ABI**：`better-sqlite3` 在 Node 与 Electron 下 ABI 不同，脚本会自动切换（`rebuild:node` / `rebuild:electron` / `rebuild:win`）。`dist:mac` / `dist:win` 打包结束会**自动 `rebuild:node` 还原**，不破坏 `pnpm dev:all`。
- **未签名（内部自用）**：mac 首次打开需右键「打开」绕过 Gatekeeper，win 点「仍要运行」绕过 SmartScreen。产物在 `apps/desktop/release/`（已 gitignore）。
- 交叉打包 win 的原生模块细节见 [CLAUDE.md](CLAUDE.md) 的「桌面端打包」章节。

---

## 端点配置与环境变量

**推荐做法**：安装后在应用内「设置」面板填写各接口地址与 Key（存后端 SQLite，随应用走，便于分发给不同网络的人）。

后端端点的取值优先级为 **设置面板 > 环境变量**（不内置任何默认地址——打包分发时不该带上任一方的内网地址；两者都为空时会给出「请先在设置中填写」的报错）。可用环境变量在启动后端时覆盖：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 后端端口 |
| `AIGC_ENDPOINT` | （无内置默认） | 图像/视频生成接口，如 `http://<your-host>:8204/aigc` |
| `UPLOAD_ENDPOINT` | （无内置默认） | 图片上传接口，如 `http://<your-host>:8511/api/upload` |
| `UPLOAD_MEDIA_ENDPOINT` | （无内置默认） | 音频/视频上传接口，如 `http://<your-host>:8511/api/upload-media` |
| `AGENT_ENDPOINT` | （无内置默认） | 画布 Agent / Any LLM 的 OpenAI 兼容接口地址 |
| `AGENT_API_KEY` | （无内置默认） | 画布 Agent / Any LLM 的 API Key |
| `AGENT_MODEL` | （无内置默认） | 画布 Agent / Any LLM 的模型名 |

```bash
PORT=8787 AIGC_ENDPOINT=http://your-host/aigc pnpm server
```

> - `AIGC_ENDPOINT` / `UPLOAD_ENDPOINT` / `UPLOAD_MEDIA_ENDPOINT` 不含内置默认值：首次使用需在设置面板（或环境变量）里填上自己的接口地址，之后即可跑通生成/上传；未填写时画布编辑、Prompt 节点等核心功能不受影响，只有生成/上传会提示先去设置里填地址。
> - **Agent / Any LLM 三项无内置默认**，未在设置面板或环境变量中配置时，相关功能会提示「请在设置中填写」。
> - **`req_from`（调用方署名）不走环境变量**，由首次启动的阻断弹窗强制填写并存后端；为空时后端拒绝一切上游生成/上传请求。


