# OpenFlow

节点式 AI 工作流画布编辑器：支持多个项目，每个项目是一块画布，可在画布上添加节点
（纯文字 Prompt 节点 / 模型调用节点）并用连线把节点连接起来。模型调用走 OpenAI 兼容的
第三方中转 API（未配置时回退 mock），数据持久化在浏览器 localStorage。

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
  main.tsx                      入口
  App.tsx                       两栏布局：左侧项目栏 + 右侧画布 / 空状态
  index.css                     Tailwind + shadcn 主题变量（勿手改主题块）
  store/
    useFlowStore.ts             Zustand store（含 persist）：projects、activeProjectId、
                                画布回调、addNode/updateNodeData；导出 useActiveProject()
    useSettingsStore.ts         Zustand store（persist key openflow-settings）：API 设置
                                （baseURL/apiKey/defaultModel）；导出 hasApiConfig()
  lib/
    types.ts                    Project / 节点数据类型 / ApiSettings / MODEL_OPTIONS（模型名建议）
    openai.ts                   runOpenAIChat()：调用 OpenAI 兼容中转 API（非流式 + 错误处理）
    mockModel.ts                runMockModel()：未配置 API 时的占位回退
    id.ts                       newId() 生成唯一 id
    utils.ts                    cn()（shadcn 生成）
  components/
    ui/                         shadcn/ui 生成的 vendored 组件（不参与 lint/format，勿手改）
    settings/SettingsDialog.tsx API 设置弹窗（base URL / API key / 默认模型）
    projects/ProjectSidebar.tsx 项目增删改 / 切换（顶部含「设置」入口）
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
- **画布**：React Flow（`@xyflow/react`）。节点是普通 React 组件，样式完全可调。
- **状态**：Zustand（`zustand/middleware` 的 `persist`，localStorage key 为 `openflow-store`）。
  画布的 nodes/edges 始终作用于「当前激活项目」，统一通过 store 的 `patchActive` 修改。
- **UI**：shadcn/ui（基于 Tailwind v4）。新增组件用 `pnpm dlx shadcn@latest add <name>`。
- **路径别名**：`@/*` → `src/*`（见 vite.config.ts 与 tsconfig）。
- **模型调用**：OpenAI 兼容的第三方中转 API（`lib/openai.ts`，浏览器直连，非流式）；
  base URL / key / 默认模型存 `useSettingsStore`（localStorage `openflow-settings`）。
  未配置（缺 baseURL 或 apiKey）时回退 `runMockModel`。无后端——key 存浏览器仅适合本地自用，
  且中转端需允许浏览器 CORS。
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
