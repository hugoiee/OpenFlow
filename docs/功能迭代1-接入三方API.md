# 功能迭代 1：接入 OpenAI 第三方中转 API

> 下面是当前要做的功能迭代；再往下是项目初始搭建的原始计划（已完成，留作背景）。

## Context（本次迭代）

初始版本的模型调用是 mock（`src/lib/mockModel.ts` 的 `runMockModel`，返回占位文本）。
本次要把 Model 节点接上**真实的 OpenAI 第三方中转 API**——即一个 OpenAI 兼容（`/chat/completions`）
但 base URL 可自定义的中转服务。仍然**纯前端、无后端**，浏览器直连中转端。

### 已确认决策（用户）
- **配置入口**：顶部「设置」弹窗填 base URL + API key + 默认模型，存 localStorage（与现有 persist 一致，运行时可改）。
- **模型选择**：Model 节点的模型字段改为**自由输入**（带常见模型名建议），适配各家中转端不同的模型名。
- **输出方式**：**非流式**，等完整返回后一次性显示。
- **Mock 去留**：未配置 key/baseURL 时**回退到 `runMockModel`**；配置了就走真实 API。

### 已知约束 / 风险
- key 存浏览器 localStorage + 前端直连，key 会暴露在浏览器，仅适合本地自用（与项目既有定位一致）。
- 中转端必须允许浏览器 **CORS**，否则前端直连会被拦；这取决于中转服务，不在代码可控范围，运行时若报 CORS 错会在结果区提示。

## 任务拆解（5 步，每步验证后再进下一步）

### 子任务 1：设置数据层
- 新增 `src/lib/types.ts` 的 `ApiSettings` 类型：`{ baseURL: string; apiKey: string; defaultModel: string }`。
- 把 `MODEL_OPTIONS` 改为 OpenAI 常见模型建议（如 `gpt-4o`、`gpt-4o-mini`、`gpt-4-turbo`），用作输入建议（datalist），不再是固定下拉。
- 新增 `src/store/useSettingsStore.ts`：Zustand + `persist`（localStorage key `openflow-settings`），状态 `settings: ApiSettings` + action `updateSettings(partial)`。仿照 `useFlowStore` 的写法。
- **验证**：`pnpm typecheck` 通过。

### 子任务 2：API 调用层
- 新增 `src/lib/openai.ts`：`runOpenAIChat(settings, model, prompt): Promise<string>`。
  - `fetch(`${baseURL}/chat/completions`)`，`Authorization: Bearer <key>`，body `{ model, messages: [{role:'user', content: prompt}] }`，非流式。
  - 处理 `!res.ok`（抛出含 status + 错误体的 Error）、取 `data.choices[0].message.content`。
  - baseURL 末尾 `/` 归一化处理。
- **验证**：`pnpm typecheck` 通过；逻辑可对照 OpenAI chat completions 形状自检。

### 子任务 3：调用分发（替换 mock 调用点）
- 改 `src/components/canvas/nodes/ModelNode.tsx` 的 `handleRun`：
  - 读 `useSettingsStore.getState().settings`；若 `baseURL && apiKey` → `runOpenAIChat(...)`，否则 `runMockModel(...)`（保留 import）。
  - `try/catch`：出错时把错误信息写入 `result`（如 `调用失败：<message>`），并复位 `running`。
- 复用现有 `collectUpstreamPrompt(id)` 取上游 prompt，复用 `updateNodeData` 写回。
- **验证**：未配置时仍回退 mock（沿用初始版本验证路径）。

### 子任务 4：设置弹窗 UI
- 加 shadcn 组件：`pnpm dlx shadcn@latest add dialog label`（`input` 已有）。
- 新增 `src/components/settings/SettingsDialog.tsx`：`Dialog` 内三个字段（base URL / API key（`type=password`）/ 默认模型），读写 `useSettingsStore`。
- 在 `src/components/projects/ProjectSidebar.tsx` 顶部标题行加一个「设置」入口（齿轮/文字按钮）触发弹窗。
- **验证**：`pnpm dev`，打开弹窗、填写保存、刷新后配置仍在（localStorage）。

### 子任务 5：模型字段改自由输入
- 改 `ModelNode.tsx`：把 `Select` 换成 shadcn `Input`（加 `nodrag`）+ `<datalist>` 提供 `MODEL_OPTIONS` 建议；`onChange` 调 `updateNodeData(id, { model })`。
- 改 `src/store/useFlowStore.ts` 的 `createNode`：model 节点默认模型取 `useSettingsStore.getState().settings.defaultModel || MODEL_OPTIONS[0]`。
- **验证**：新建 Model 节点默认模型来自设置；可手动输入任意模型名并持久化。

## 验证方式（端到端）
1. `pnpm dev`。不填设置 → Model 节点运行仍出 mock 占位（回退正常）。
2. 打开「设置」填入中转 base URL + key + 默认模型，保存。
3. Prompt 节点写内容 → 连到 Model 节点 → 运行：结果区显示**真实模型返回**。
4. 故意填错 key/baseURL → 运行：结果区显示**错误提示**（不崩溃）。
5. 刷新浏览器：设置与画布数据都还在。
6. `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过。

## 完成后需同步
- 更新 `CLAUDE.md`：模型调用从「仅 mock」改为「中转 API + 未配置回退 mock」，新增 `lib/openai.ts`、`store/useSettingsStore.ts`、`components/settings/` 的说明。

---

# OpenFlow — 节点式 AI 工作流画布编辑器（初始搭建计划，已完成）

## Context

用户面对一个空目录 (`/Users/hugo/Developer/OpenFlow`)，要从零搭建一个可视化画布编辑器：
支持**多个项目**，每个项目是一块**画布**，画布上可以添加**节点**（纯文字 prompt 节点 / 模型调用节点），
并用**连线**把节点连接起来（类似 n8n / LangFlow / ComfyUI 的交互形态）。

本次目标遵循「从零搭建四步法」：**先求可运行、可解释、可继续扩展，不一步到位堆功能**。
产出一个最小可迭代版本——画布交互完整、数据本地持久化、模型调用先用 mock 占位。

### 已确认的技术选型（用户决策）
- **框架 / 画布**：React + React Flow (`@xyflow/react`) —— 节点画布编辑器的事实标准，自带拖拽 / 连线 / 缩放平移 / 自定义节点。
- **构建 / 语言 / 样式**：Vite + TypeScript (strict) + Tailwind CSS。
- **UI 组件库**：shadcn/ui —— 基于 Tailwind，组件代码直接进项目可自由改。React Flow 自定义节点就是普通 React 组件，样式完全可调，节点内部 UI（Card / Button / Select / Textarea / Input 等）统一用 shadcn/ui 搭。
- **状态管理**：Zustand —— React Flow 官方推荐用于管理 nodes/edges 及多项目状态。
- **模型调用**：先做 UI + Mock（模型节点返回占位/假数据），不引入后端。
- **数据存储**：浏览器 localStorage（Zustand `persist` 中间件），多项目/画布数据本地持久化，刷新不丢。
- **包管理**：pnpm。

## Step 1 — 项目骨架（先跑起来，再叠配置）

1. 用 Vite 初始化 React + TS 项目（`pnpm create vite . --template react-ts`，在当前目录）。
2. 安装核心依赖：`@xyflow/react`、`zustand`。
3. 安装样式：`tailwindcss @tailwindcss/vite`（Tailwind v4，通过 Vite 插件接入）。
4. 接入 **shadcn/ui**：
   - 配 `@/*` 路径别名（`tsconfig.json` + `tsconfig.app.json` 的 `paths`，`vite.config.ts` 的 `resolve.alias`，需装 `@types/node`）。
   - `pnpm dlx shadcn@latest init`，再按需 `add` 组件（card / button / select / textarea / input / dropdown-menu）。
5. 验证：`pnpm dev` 能打开默认页面。

## Step 2 — 目录结构（一次性定好）

```
src/
  main.tsx                      入口
  App.tsx                       顶层布局：左侧项目栏 + 右侧画布
  index.css                     Tailwind 引入 + 全局样式
  store/
    useFlowStore.ts             Zustand store：projects 列表、当前项目、nodes/edges、persist 到 localStorage
  lib/
    types.ts                    Project / 节点数据类型 (PromptNodeData / ModelNodeData)
    mockModel.ts                runMockModel()：模拟模型调用，返回占位结果（带延迟）
    id.ts                       生成唯一 id
  components/
    ui/                         shadcn/ui 生成的组件（card/button/select/textarea/input...）
    projects/
      ProjectSidebar.tsx        项目列表：新建 / 切换 / 重命名 / 删除项目
    canvas/
      FlowCanvas.tsx            React Flow 画布封装（ReactFlowProvider、背景、控件、连线逻辑）
      Toolbar.tsx               画布工具栏：添加 Prompt 节点 / 添加 Model 节点
      nodes/
        PromptNode.tsx          纯文字 prompt 节点（可编辑 textarea + 输出 handle）
        ModelNode.tsx           模型调用节点（选模型 + 运行按钮 + mock 结果 + 输入/输出 handle）
        index.ts                nodeTypes 注册表
```

## Step 3 — 核心功能实现（分步，每步验证）

按以下顺序实现，每步 `pnpm dev` 验证后再进下一步：

1. **数据模型 + Store** (`types.ts`, `useFlowStore.ts`)
   - `Project { id, name, nodes, edges }`，store 维护 `projects[]` 与 `activeProjectId`。
   - actions：`addProject` / `renameProject` / `deleteProject` / `setActiveProject`、
     `onNodesChange` / `onEdgesChange` / `onConnect`（用 React Flow 的 `applyNodeChanges`/`applyEdgeChanges`/`addEdge`）、
     `addNode(type)`、`updateNodeData(id, data)`。
   - 用 Zustand `persist` 中间件把整个 `projects` 状态写入 localStorage。

2. **画布** (`FlowCanvas.tsx`)
   - 渲染 `<ReactFlow>`，绑定当前项目的 nodes/edges 与 store 的回调。
   - 加 `<Background>`、`<Controls>`、`<MiniMap>`；注册自定义 `nodeTypes`。

3. **自定义节点** (`PromptNode.tsx` / `ModelNode.tsx`) —— 内部 UI 用 shadcn/ui 搭
   - PromptNode：`Card` 外壳 + `Textarea` 可编辑文本，底部一个 source `Handle`。
   - ModelNode：`Card` 外壳，顶部 target `Handle` + 底部 source `Handle`；`Select` 选模型（占位选项）、`Button` 运行调用 `runMockModel()`、展示返回的占位结果与 loading 态。
   - 编辑节点内容时调用 `updateNodeData`。节点内的交互元素加 `nodrag` class，避免和画布拖拽冲突。

4. **工具栏 + 项目栏** (`Toolbar.tsx` / `ProjectSidebar.tsx`)
   - Toolbar：两个按钮添加两类节点（落在画布可见区域中心附近）。
   - Sidebar：项目增删改 + 高亮当前项目。

5. **整合布局** (`App.tsx`)
   - 左 Sidebar + 右 Canvas 的两栏布局，无选中项目时给空状态提示。

## Step 4 — 工具链 + CLAUDE.md

- 工具链：保留 Vite 模板自带的 ESLint（TS + React Hooks 规则），在 `package.json` 补 `lint` / `format` 脚本；
  补 `.gitignore`（Vite/Node，模板已带，检查即可）。一套方案，不叠多个 linter。
- 首个可运行版本稳定后，生成 `CLAUDE.md`（≤100 行）：项目概述、常用命令、目录结构、技术约束、编码规范。

## 验证方式（端到端）

1. `pnpm dev` 打开页面。
2. 新建 2 个项目，确认可在左侧切换，各自画布独立。
3. 在画布添加 Prompt 节点和 Model 节点，编辑文本、拖动位置。
4. 从一个节点拖出连线连到另一个节点，确认连线成功。
5. 点 Model 节点「运行」，确认出现 loading 后显示 mock 结果。
6. 刷新浏览器，确认所有项目 / 节点 / 连线 / 内容都还在（localStorage 持久化生效）。
7. `pnpm build` 通过，无类型错误。

## 备注 / 后续可扩展（本次不做）
- 接真实模型 API（前端直连或加后端代理）—— 当前 `mockModel.ts` 是预留接口点。
- 节点执行编排（按连线拓扑顺序把上游输出喂给下游）。
- 导入 / 导出工作流 JSON、撤销重做、节点更多类型。