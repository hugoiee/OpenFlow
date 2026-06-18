# OpenFlow

节点式 AI 工作流画布编辑器：支持多个项目，每个项目是一块画布，可在画布上添加节点
（纯文字 Prompt 节点 / 模型调用节点）并用连线把节点连接起来。模型调用走 OpenAI 兼容的
多供应商 API（设置面板选供应商、填 key/BaseURL、动态拉 /models 选模型）。**前后端架构**：
数据存后端 SQLite，API key 只存后端，模型调用经后端代理（key 不进浏览器、绕开 CORS）。单用户、无鉴权。

## 仓库结构（pnpm workspaces monorepo）

```
apps/web/        前端（Vite + React + React Flow + shadcn/ui），包名 @openflow/web
apps/server/     后端（Hono + better-sqlite3），包名 @openflow/server
packages/shared/ 前后端共享的纯 TS 类型/常量，包名 @openflow/shared
```

## 常用命令（在仓库根运行）

```bash
pnpm dev:all       # 同时起前端(5173) + 后端(8787)（concurrently）
pnpm dev           # 只起前端（= --filter @openflow/web dev）
pnpm server        # 只起后端（tsx watch）
pnpm build         # pnpm -r build（全包）
pnpm typecheck     # pnpm -r typecheck
pnpm lint          # pnpm -r lint
pnpm format        # Prettier 格式化 apps/*/src 与 packages/*/src（不含 components/ui）
```

## 目录结构

```
packages/shared/src/index.ts   ProviderId/PROVIDER_PRESETS/ProviderConfig(含 key,仅后端用) /
                               ProviderConfigPublic(hasKey,无 key) / ProjectDTO / SettingsDTO / 各请求体类型
apps/server/src/
  index.ts                     Hono 起服务(8787)，挂 /api 路由
  db.ts                        better-sqlite3 建库建表（projects / settings），库文件 apps/server/data/openflow.db（gitignore）
  settings-store.ts            读写 settings 单行（getActiveConfig 含 key）
  provider.ts                  fetchModels()/runChat()：OpenAI 兼容 /models 与 /chat/completions（非流式）
  routes/projects.ts           /api/projects CRUD（nodes/edges 以 JSON 存）
  routes/settings.ts           GET /api/settings(不回 key,只回 hasKey) / PUT(写入,key 留空则保留)
  routes/model.ts              POST /api/models(代理拉模型) / POST /api/run(用激活供应商 key 代理聊天)
apps/web/src/
  main.tsx                     入口：先 migrateLocalStorage() 迁移旧数据，再 load store，最后渲染（HashRouter）
  App.tsx                      路由：/ → 首页，/project/:id → 工作区，* → 回首页
  store/useFlowStore.ts        Zustand（无 persist）：启动 loadProjects() 拉后端；增删改调 API；
                               画布编辑本地即时更新 + 防抖(500ms) PUT 保存激活项目；homeView 存 localStorage
  store/useSettingsStore.ts    Zustand（无 persist）：loadSettings() 从后端拉公开配置(无 key)；
                               saveProvider() PUT 后回拉；导出 getActiveConfig()/hasApiConfig()
  lib/api.ts                   /api/* fetch 封装（项目 CRUD / 设置 / 模型）
  lib/migrate.ts               首次启动把旧 localStorage（openflow-store/settings）一次性导入后端，打 openflow-migrated 标记
  lib/types.ts                 React Flow 强类型节点（FlowNode/Project）；供应商类型从 @openflow/shared 再导出
  components/ui/               shadcn/ui vendored（不参与 lint/format，勿手改）
  components/settings/SettingsDialog.tsx 供应商面板（选商→key/BaseURL→获取模型→选模型→保存；key 写入不回显，用 hasKey 占位）
  components/home/             HomePage（宫格/列表 + 新建）、ProjectCard
  components/workspace/ProjectWorkspace.tsx  Sidebar + 画布；未 loaded 前不跳首页
  components/projects/ProjectSidebar.tsx     shadcn Sidebar 项目栏（增删改 / 路由切换）
  components/canvas/
    FlowCanvas.tsx             React Flow 封装；连线默认 smoothstep（横平竖直）
    Toolbar.tsx                添加 Prompt / Model 节点
    nodes/PromptNode.tsx       Prompt 节点（Card + Textarea，source Handle 在右）
    nodes/ModelNode.tsx        Model 节点（模型下拉来自激活供应商 models；运行调 /api/run；Handle 左进右出）
    nodes/index.ts             nodeTypes 注册表
```

## 技术约束

- **框架 / 构建**：React 19 + Vite + TypeScript（strict）；pnpm workspaces。
- **后端**：Hono + `@hono/node-server`，`tsx watch` 跑（免构建）；端口 8787。Vite dev 代理 `/api` → 8787（`apps/web/vite.config.ts`）。
- **数据库**：SQLite（`better-sqlite3`，单文件 `apps/server/data/openflow.db`）。`projects` 表 nodes/edges 存 JSON；`settings` 单行存 `activeProviderId` + `configs`(含各供应商 key)。原生模块装不上时回退 Node 内置 `node:sqlite`。
- **数据流**：前端无 localStorage 持久化（仅 homeView + 迁移标记用 localStorage）。项目数据走 `/api/projects`；画布高频编辑防抖 PUT。设置走 `/api/settings`，**key 只存后端、GET 不回传**。
- **模型调用**：经后端 `/api/run`、`/api/models` 代理；后端用激活供应商存储 key 调 OpenAI 兼容 `/chat/completions`、`/models`（非流式）。仅支持 OpenAI 兼容协议（Anthropic 原生不支持，走「自定义/中转」）。前端不再直连供应商，**无 CORS、key 不暴露**。
- **路由**：`react-router-dom` `HashRouter`。
- **画布**：React Flow（`@xyflow/react`），节点是普通 React 组件；连线 smoothstep。
- **UI**：shadcn/ui（Tailwind v4）。新增组件 `pnpm dlx shadcn@latest add <name>`（在 apps/web 内）。
- **路径别名**：`@/*` → `apps/web/src/*`。
- **共享类型**：跨前后端的纯数据契约放 `packages/shared`；后端不引 `@xyflow/react`，nodes/edges 当不透明 JSON。

## 编码规范

- 组件文件 PascalCase，函数组件具名导出。
- 新增节点类型需同步更新 `apps/web/src/lib/types.ts`、`nodes/index.ts`、`createNode()`(store)、`Toolbar`。
- 节点内可交互元素加 `nodrag` class。
- 不手改 `apps/web/src/components/ui/*`、`src/hooks/use-mobile.ts` 与 `index.css` 的 shadcn 主题块（生成内容，已在 eslint globalIgnores 排除）。
- 改后端 SQLite 表结构时注意已有数据兼容。
- 提交前确保根 `pnpm -r lint`、`pnpm -r typecheck`、`pnpm -r build` 通过。

## 后续可扩展（当前未做）
- 多用户 + 鉴权；流式输出（SSE）。
- 按连线拓扑顺序自动编排执行（把上游输出喂给下游）。
- 导入 / 导出工作流 JSON、撤销重做、暗色模式切换、更多节点类型。
