# 在全新 Mac 上运行 OpenFlow

本文档整理了在一台**全新 macOS** 电脑上从零跑起 OpenFlow 所需安装的全部依赖、版本要求与安装方法。

> 一句话总结：装好 **Xcode 命令行工具 + Node.js 22 + pnpm**，然后 `pnpm install && pnpm dev:all` 即可。

---

## 1. 依赖总览

| 依赖 | 版本要求 | 作用 | 是否必须 |
| --- | --- | --- | --- |
| **Xcode Command Line Tools** | 最新 | 提供 `git`、`clang`/`make`，用于编译原生模块 `better-sqlite3` | ✅ 必须 |
| **Node.js** | **≥ 22**（推荐 22 LTS） | 运行前端构建与后端服务 | ✅ 必须 |
| **pnpm** | **≥ 9**（推荐 10，本机用 11 亦可） | 包管理器（monorepo workspaces） | ✅ 必须 |
| **Homebrew** | 最新 | macOS 包管理器，用来装 Node/pnpm | ⭕ 推荐（也可用 nvm/官网安装包代替） |

> **为什么 Node 要 ≥ 22**：前端用 Vite 8（要求 Node 20.19+ / 22.12+）、后端用 better-sqlite3 11（要求 Node 20+），且 `db.ts` 在原生模块装不上时会回退到 Node 内置 `node:sqlite`（需 Node 22+）。综合取 **Node 22 LTS** 最稳（开发机当前为 v22.17）。

项目本身的 npm 依赖（React 19 / Vite 8 / React Flow / Tailwind v4 / Hono / better-sqlite3 等）**无需手动安装**，`pnpm install` 会全部拉齐。

---

## 2. 安装步骤

### 第 1 步：Xcode 命令行工具

提供 `git`（克隆代码）和原生模块编译工具链（`better-sqlite3` 需要）。

```bash
xcode-select --install
```

弹窗点「安装」，等待完成。验证：

```bash
git --version
clang --version
```

### 第 2 步：安装 Homebrew（推荐）

如果还没有 Homebrew：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

安装完按提示把 brew 加入 PATH（Apple Silicon 机器通常是）：

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 第 3 步：安装 Node.js 22

**方式 A — Homebrew（最简单）**

```bash
brew install node@22
brew link --overwrite --force node@22
```

**方式 B — nvm（需要多版本切换时推荐）**

```bash
brew install nvm
mkdir -p ~/.nvm
# 按 brew 提示把 nvm 初始化写入 ~/.zshrc，然后重开终端
nvm install 22
nvm use 22
nvm alias default 22
```

验证：

```bash
node -v   # 应 ≥ v22
npm -v
```

### 第 4 步：安装 pnpm

本项目用 pnpm 管理 monorepo（`pnpm-lock.yaml` 为 lockfile v9，需 pnpm ≥ 9）。

**方式 A — Corepack（Node 自带，推荐）**

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

**方式 B — Homebrew**

```bash
brew install pnpm
```

**方式 C — 官方脚本**

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

验证：

```bash
pnpm -v   # 应 ≥ 9
```

---

## 3. 拉取代码并安装依赖

```bash
# 克隆仓库（替换成实际地址）
git clone <仓库地址> OpenFlow
cd OpenFlow

# 安装所有 workspace 依赖
pnpm install
```

> **关于原生模块编译**：`better-sqlite3` 是原生模块。`pnpm-workspace.yaml` 已通过 `allowBuilds` 放行其构建脚本，正常会自动下载预编译二进制或本地编译（依赖第 1 步的命令行工具）。
> 若编译报错（缺少 Python 等），补装：
> ```bash
> brew install python  # 提供 node-gyp 需要的 python3
> ```
> 仍失败也无妨——`db.ts` 会自动回退到 Node 22 内置的 `node:sqlite`。

---

## 4. 启动项目

在仓库根目录运行：

```bash
pnpm dev:all     # 同时起前端(5173) + 后端(8787)
```

- 前端：http://localhost:5173
- 后端：http://localhost:8787（Vite 开发期会把 `/api` 代理到这里）

其他常用命令：

```bash
pnpm dev         # 只起前端
pnpm server      # 只起后端
pnpm build       # 全包构建
pnpm typecheck   # 全包类型检查
pnpm lint        # 全包 lint
```

数据库文件会自动生成在 `apps/server/data/openflow.db`（已 gitignore，无需手动建）。

> **首次启动**会弹出阻断弹窗，需先填写调用方署名 `req_from` 才能进入应用（图像/视频生成与图片上传统一使用此署名）。

---

## 5. （可选）环境变量配置

后端默认值已写死，**不配也能起服务**。但图像/视频生成会调用内网 AIGC 接口，相关地址可用环境变量覆盖：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 后端端口 |
| `AIGC_ENDPOINT` | `http://10.75.202.161:8204/aigc` | 图像/视频生成接口（**内网地址**） |
| `UPLOAD_ENDPOINT` | `http://10.75.202.161:8511/api/upload` | 图片上传接口（**内网地址**） |
| `AIGC_REQ_FROM` | `openflow` | 请求署名 `req_from` 的兜底值（前端「设置」面板可全局配置，首次启动也会强制填写） |

> 默认在**内网环境**使用：AIGC / Upload 地址 `10.75.202.161` 即内网默认值，装好依赖即可跑通图像/视频生成与上传。若不在该内网，仅生成/上传无法连通，画布编辑、Prompt 节点等核心功能不受影响。

如需自定义，可在启动后端时传入，例如：

```bash
PORT=8787 AIGC_ENDPOINT=http://your-host/aigc pnpm server
```

---

## 6. 安装清单速查

```bash
# 1. 命令行工具
xcode-select --install

# 2. Homebrew（若无）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3. Node 22
brew install node@22 && brew link --overwrite --force node@22

# 4. pnpm
corepack enable && corepack prepare pnpm@latest --activate

# 5. 项目
git clone <仓库地址> OpenFlow && cd OpenFlow
pnpm install
pnpm dev:all
```

完成后打开 http://localhost:5173 即可使用。
