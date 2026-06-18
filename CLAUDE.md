# OpenFlow

节点式 AI 工作流画布编辑器：支持多个项目，每个项目是一块画布，可在画布上添加节点
（纯文字 Prompt 节点 / 模型调用节点）并用连线把节点连接起来。模型调用走 OpenAI 兼容的
多供应商 API（在设置面板选供应商、填 key/BaseURL、动态拉取 /models 选模型；未配置激活供应商时
回退 mock），数据持久化在浏览器 localStorage。

## 常用命令

```bash
pnpm dev           # 启动开发服务器（默认 http://localhost:5173）
pnpm build         # 类型检查 + 生产构建（tsc -b && vite build）
pnpm preview       # 本地预览构建产物
pnpm typecheck     # 仅类型检查
pnpm lint          # ESLint 检查
pnpm format        # Prettier 格式化 src（不含 src/components/ui）
```

## 目录结构

```
src/
  main.tsx                      入口（用 HashRouter 包裹 App）
  App.tsx                       路由出口：/ → 首页，/project/:id → 工作区，* → 重定向回首页
  index.css                     Tailwind + shadcn 主题变量（勿手改主题块）
  store/
    useFlowStore.ts             Zustand store（含 persist）：projects、activeProjectId、homeView、
                                画布回调、addNode/updateNodeData；addProject 返回新项目 id；
                                导出 useActiveProject()
    useSettingsStore.ts         Zustand store（persist key openflow-settings，version 1 + migrate）：
                                多供应商配置 { activeProviderId, configs }；导出 getActiveConfig() /
                                hasApiConfig() / emptyProviderConfig()
  lib/
    types.ts                    Project / 节点数据类型 / ProviderId / PROVIDER_PRESETS / ProviderConfig
    openai.ts                   runOpenAIChat()（非流式聊天）+ fetchModels()（GET /models）；入参 ProviderEndpoint
    mockModel.ts                runMockModel()：未配置激活供应商时的占位回退
    id.ts                       newId() 生成唯一 id
    utils.ts                    cn()（shadcn 生成）
  components/
    ui/                         shadcn/ui 生成的 vendored 组件（不参与 lint/format，勿手改）
    settings/SettingsDialog.tsx 模型供应商设置面板（选供应商→key/BaseURL→获取模型→选模型→保存）
    home/
      HomePage.tsx             全屏首页：项目总览，宫格/列表切换（读写 store.homeView）+ 新建项目
      ProjectCard.tsx          单个项目卡片：点击进画布、双击/菜单重命名、菜单删除（grid/list 两种样式）
    workspace/ProjectWorkspace.tsx 工作区：SidebarProvider 包裹 ProjectSidebar + SidebarInset（含
                                SidebarTrigger 折叠按钮 + 画布）；useParams 取 :id 同步进 store.activeProjectId
    projects/ProjectSidebar.tsx 基于 shadcn Sidebar 的项目栏（增删改 / 切换走路由 navigate）；
                                顶部「OpenFlow」与「返回首页」回 /
    canvas/
      FlowCanvas.tsx            React Flow 画布封装（含 Provider 包装导出）
      Toolbar.tsx               添加 Prompt / Model 节点
      nodes/
        PromptNode.tsx          Prompt 节点（Card + Textarea + source Handle）
        ModelNode.tsx           Model 节点（模型名 Input + 运行 + 结果，target/source Handle）；
                                handleRun 按是否配置 API 分发到 runOpenAIChat / runMockModel
        index.ts                nodeTypes 注册表
```

## 技术约束

- **框架 / 构建**：React 19 + Vite + TypeScript（strict）。
- **路由**：`react-router-dom`（用 `HashRouter`，纯前端无后端，刷新不 404）。路由表：
  `/` → 首页 `HomePage`，`/project/:id` → 工作区 `ProjectWorkspace`。`ProjectWorkspace` 通过
  `useParams` 把 `:id` 同步进 store 的 `activeProjectId`（画布编辑依赖它）；id 不存在时重定向回 `/`。
- **画布**：React Flow（`@xyflow/react`）。节点是普通 React 组件，样式完全可调。
- **状态**：Zustand（`zustand/middleware` 的 `persist`，localStorage key 为 `openflow-store`）。
  画布的 nodes/edges 始终作用于「当前激活项目」，统一通过 store 的 `patchActive` 修改。
  `addProject` 返回新项目 id（便于新建后 `navigate`）；首页宫格/列表偏好存 `homeView`（已持久化）。
- **UI**：shadcn/ui（基于 Tailwind v4）。新增组件用 `pnpm dlx shadcn@latest add <name>`。
  侧栏用 shadcn `sidebar`（连带 vendored 的 `sheet`/`tooltip`/`separator`/`skeleton` 与
  `src/hooks/use-mobile.ts`）；`use-mobile.ts` 同 `src/components/ui` 一样是生成代码，已在
  `eslint.config.js` 的 globalIgnores 排除，勿手改。
- **路径别名**：`@/*` → `src/*`（见 vite.config.ts 与 tsconfig）。
- **模型调用**：OpenAI 兼容协议（`lib/openai.ts`，浏览器直连，非流式）。多供应商：预置
  OpenAI/DeepSeek/Kimi/Qwen/GLM/自定义（`PROVIDER_PRESETS`），各自存 key/baseURL/选定模型/已拉取模型列表，
  存 `useSettingsStore`（localStorage `openflow-settings`）。模型列表经 `fetchModels()` 动态拉 `/models`；
  运行用激活供应商配置（`getActiveConfig`），未配置时回退 `runMockModel`。仅支持 OpenAI 兼容
  `/chat/completions` + `/models`（Anthropic 原生协议不支持，走「自定义/中转」）。无后端——key 存浏览器
  仅适合本地自用，且供应商/中转端需允许浏览器 CORS。改 persist 结构时记得升 `version` + `migrate`。
- **包管理**：pnpm。

## 编码规范

- 组件文件用 PascalCase（如 `ModelNode.tsx`），函数组件具名导出。
- 节点数据类型集中在 `lib/types.ts`；新增节点类型需同时更新 `types.ts`、`nodes/index.ts`、
  `createNode()`（store）和 `Toolbar`。
- 节点内可交互元素（输入、按钮、下拉）要加 `nodrag` class，避免与画布拖拽冲突。
- 不手改 `src/components/ui/*` 与 `index.css` 的 shadcn 主题块；它们是生成内容。
- 提交前确保 `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过。

## 后续可扩展（当前未做）
- 流式输出（SSE，增量更新结果）；后端代理以隐藏 key / 绕过 CORS。
- 按连线拓扑顺序自动编排执行（把上游输出喂给下游）。
- 导入 / 导出工作流 JSON、撤销重做、暗色模式切换、更多节点类型。
