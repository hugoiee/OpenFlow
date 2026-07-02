# OpenFlow

节点式 AI 工作流画布编辑器：在画布上添加**文本 Prompt / 图像生成 / 视频生成**节点并连线编排。
图像（Image 2、Nano Banana）与视频（Seedance）已接入真实生成，经后端代理调内网 AIGC 接口。

- **前端**：Vite + React 19 + React Flow + shadcn/ui（端口 5173）
- **后端**：Hono + better-sqlite3（端口 8787），数据存 SQLite
- **结构**：pnpm workspaces monorepo（`apps/web`、`apps/server`、`packages/shared`）

> 默认在**内网环境**使用：后端的 AIGC / Upload 接口地址已内置内网默认值，装好依赖即可直接跑通图像/视频生成。

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

打开 http://localhost:5173 即可使用。**首次启动会弹出阻断弹窗，需先填写调用方署名 `req_from` 才能进入**（图像/视频生成与图片上传统一用此署名）。数据库文件会自动生成在 `apps/server/data/openflow.db`。

---

## 常用命令（仓库根运行）

```bash
pnpm dev:all     # 前端 + 后端
pnpm dev         # 只起前端
pnpm server      # 只起后端
pnpm build       # 全包构建
pnpm typecheck   # 全包类型检查
pnpm lint        # 全包 lint
pnpm format      # Prettier 格式化
```

---

## 环境变量（可选）

内网默认值已写死，**通常无需配置**。如需覆盖，可在启动后端时传入：

| 变量 | 默认值（内网） | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 后端端口 |
| `AIGC_ENDPOINT` | `http://10.75.202.161:8204/aigc` | 图像/视频生成接口 |
| `UPLOAD_ENDPOINT` | `http://10.75.202.161:8511/api/upload` | 图片上传接口 |

```bash
PORT=8787 AIGC_ENDPOINT=http://your-host/aigc pnpm server
```

> 更详细的全新 Mac 搭建说明见 [docs/本地环境搭建-Mac.md](docs/本地环境搭建-Mac.md)。
