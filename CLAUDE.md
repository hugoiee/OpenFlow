# OpenFlow

节点式 AI 工作流画布编辑器：支持多个项目，每个项目是一块画布，可在画布上添加节点
（节点列表按输出形态分三类：**文本** Prompt 节点 / **图像** 生成节点 / **视频** 生成节点）并用连线把
节点连接起来。还支持从桌面**拖入图像/音频文件**：拖到空白处经 /api/upload 上传后生成 **素材节点**（图像素材 / 音频素材，纯「源」节点，
连下游图像/视频节点作输入——图像素材作输入图、音频素材作视频 audio_list）；拖到已有图像/视频节点上则把图片直接追加进其输入图，拖音频到视频节点则追加进其输入音频（audio_list）。
图像类的 **Image 2(gpt-image-2)** 与 **Nano Banana(nano-banana)**、视频类的 **Seedance(seedance)** 均已接入真实生成
（经后端代理调 AIGC 接口；prompt 取自上游 Prompt 节点，节点上可调各自参数，输入图可手填 URL 或经 /api/upload 上传，运行后展示结果图/视频）。
调用方署名 **req_from** 为全局设置（首次打开网站若未填则强制填写，存后端单例 settings；图像/视频生成与图片上传统一由后端注入）。设置面板仅此一项。**前后端架构**：
数据存后端 SQLite，AIGC 调用经后端代理（绕开 CORS）。单用户、无鉴权。

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
packages/shared/src/index.ts   ProjectDTO / SettingsDTO(defaultReqFrom) / SaveSettingsBody(defaultReqFrom) / GenImageBody / GenVideoBody(含 audios → audio_list)
apps/server/src/
  index.ts                     Hono 起服务(8787)，挂 /api 路由
  db.ts                        better-sqlite3 建库建表（projects / settings），库文件 apps/server/data/openflow.db（gitignore）；settings 表只存 default_req_from（旧库 provider 列留存不读）
  settings-store.ts            读写 settings 单行的全局 default_req_from
  provider.ts                  runImageGen()/runVideoGen()：POST AIGC 接口生成图像/视频（按 model 分支构造 payload；视频 audio_list 取自入参 audios）+ 从任意响应稳健解析 URL；uploadFiles(form,kind)：转发 multipart 到上传接口（图片走 UPLOAD_ENDPOINT /api/upload，音频走 UPLOAD_MEDIA_ENDPOINT /api/upload-media）；resolveReqFrom()：把全局署名解析成最终 req_from（空回退 env AIGC_REQ_FROM，再回退 'openflow'）
  routes/projects.ts           /api/projects CRUD（nodes/edges 以 JSON 存）
  routes/settings.ts           GET /api/settings(回全局 defaultReqFrom) / PUT(写入 defaultReqFrom)
  routes/image.ts              POST /api/aigc(图像生成代理：Image 2/Nano Banana，按 model 补 version/config 转发 AIGC；地址用 env AIGC_ENDPOINT 覆盖；req_from 从全局设置注入)
  routes/video.ts              POST /api/video(视频生成代理：seedance，补 version/mode/config + audios→audio_list 转发 AIGC /aigc；req_from 从全局设置注入)
  routes/upload.ts             POST /api/upload(文件上传代理：按 query kind 分流转发 multipart——图片→env UPLOAD_ENDPOINT，音频(kind=audio)→env UPLOAD_MEDIA_ENDPOINT /api/upload-media；req_from 从全局设置注入)
apps/web/src/
  main.tsx                     入口：先 migrateLocalStorage() 迁移旧数据，再 load store，最后渲染（HashRouter）
  App.tsx                      用 ReqFromGate 包裹路由（/ → 首页，/project/:id → 工作区，* → 回首页）
  store/useFlowStore.ts        Zustand（无 persist）：启动 loadProjects() 拉后端；增删改调 API；
                               画布编辑本地即时更新 + 防抖(500ms) PUT 保存激活项目；homeView 存 localStorage；
                               addAssetNode(kind,position)/removeNode(id) 供拖拽建/撤素材节点；载入时复位 asset 的 uploading
  store/useSettingsStore.ts    Zustand（无 persist）：loadSettings() 拉全局 defaultReqFrom；saveReqFrom() PUT 后回拉
  lib/api.ts                   /api/* fetch 封装（项目 CRUD / 设置 get·save / 图像生成 generateImageApi / 视频生成 generateVideoApi / 文件上传 uploadFilesApi(files,kind)——图片默认走 /api/upload，音频 kind=audio 走 /api/upload-media）
  lib/graph.ts                 连线采集：collectUpstreamPrompt（上游文本）/ collectUpstreamImages（上游 image 结果 + 图像素材 URL 作输入图）/ collectUpstreamAudio（上游音频素材 URL 作 audio_list）
  lib/migrate.ts               首次启动把旧 localStorage（openflow-store）项目数据一次性导入后端，打 openflow-migrated 标记
  lib/types.ts                 React Flow 强类型节点（FlowNode = Prompt/Image/Video/Asset；AssetNodeData{kind:image|audio,url,fileName,uploading,error}；Project）
  lib/nodeCatalog.ts           图像/视频预置模型 + 模型→AIGC model_name 映射(IMAGE_API_MODEL/imageApiModel、VIDEO_API_MODEL/videoApiModel) + 各模型可调项选项(图像尺寸/质量/张数、Nano version/宽高比/尺寸、Seedance version/mode/分辨率/时长) + 配色文案（侧栏与节点共用，含素材节点 ASSET_NODE_META：图像=琥珀 / 音频=天蓝）
  components/ui/               shadcn/ui vendored（不参与 lint/format，勿手改）
  components/gate/ReqFromGate.tsx 启动强制填写 req_from：设置已加载且全局署名为空时全屏阻断弹窗，填写保存后放行（已填则不出现）
  components/settings/SettingsDialog.tsx 设置面板：仅全局 req_from（署名）输入 + 保存
  components/home/             HomePage（宫格/列表 + 新建）、ProjectCard
  components/workspace/ProjectWorkspace.tsx  Sidebar + 画布；未 loaded 前不跳首页
  components/projects/ProjectSidebar.tsx     工作区 Sidebar：返回首页 + 节点列表（按文本/图像/视频三类分组，点按添加对应节点并预设模型；不再显示项目列表）
  components/canvas/
    FlowCanvas.tsx             React Flow 封装；连线默认 smoothstep（横平竖直）；onDragOver/onDrop 接桌面拖入文件（按 MIME 分图像/音频，screenToFlowPosition 定位：图片落图像/视频节点→追加输入图、音频落视频节点→追加输入音频，否则建素材节点上传写回 URL）
    nodes/PromptNode.tsx       Prompt 节点（Card + Textarea，source Handle 在右）
    nodes/ImageNode.tsx        图像生成节点：输入图(可上传)/按模型(Image 2 走尺寸/质量/张数；Nano Banana 走 version/宽高比/尺寸)；运行收集上游 Prompt 文本→generateImageApi→展示结果图；Handle 左进右出（req_from 署名走全局设置，节点不再单设）
    nodes/SeedanceNode.tsx     视频生成节点（seedance）：输入图(可上传)/输入音频(可上传，走 /api/upload-media)/version/mode/分辨率/时长；运行时音频 = 上游音频素材(连线)+ 本节点手动填/传 URL 合并作 audios→generateVideoApi→<video> 展示；Handle 左进右出（req_from 署名走全局设置，节点不再单设）
    nodes/AssetNode.tsx        素材节点（桌面拖入）：图像素材显示缩略图 / 音频素材显示 <audio>；上传中骨架、失败内联；仅右侧 source Handle（纯源，连下游作输入）
    nodes/index.ts             nodeTypes 注册表（prompt → PromptNode / image → ImageNode / video → SeedanceNode / asset → AssetNode）
```

## 技术约束

- **框架 / 构建**：React 19 + Vite + TypeScript（strict）；pnpm workspaces。
- **后端**：Hono + `@hono/node-server`，`tsx watch` 跑（免构建）；端口 8787。Vite dev 代理 `/api` → 8787（`apps/web/vite.config.ts`）。
- **数据库**：SQLite（`better-sqlite3`，单文件 `apps/server/data/openflow.db`）。`projects` 表 nodes/edges 存 JSON；`settings` 单行存 `default_req_from`(全局署名)。原生模块装不上时回退 Node 内置 `node:sqlite`。
- **数据流**：前端无 localStorage 持久化（仅 homeView + 迁移标记用 localStorage）。项目数据走 `/api/projects`；画布高频编辑防抖 PUT。全局 req_from 走 `/api/settings`。
- **生成调用**：图像 `/api/aigc`、视频 `/api/video`、文件上传 `/api/upload`（图片走 `UPLOAD_ENDPOINT`，音频 `kind=audio` 走 `UPLOAD_MEDIA_ENDPOINT` /api/upload-media）均经后端代理转发到 AIGC 接口（绕 CORS）；req_from 由后端从全局设置注入（空回退 env `AIGC_REQ_FROM`）。
- **启动门槛**：`ReqFromGate` 在设置加载后若 req_from 为空则全屏阻断，必须填写署名才放行。
- **路由**：`react-router-dom` `HashRouter`。
- **画布**：React Flow（`@xyflow/react`），节点是普通 React 组件；连线 smoothstep。
- **UI**：shadcn/ui（Tailwind v4）。新增组件 `pnpm dlx shadcn@latest add <name>`（在 apps/web 内）。
- **路径别名**：`@/*` → `apps/web/src/*`。
- **共享类型**：跨前后端的纯数据契约放 `packages/shared`；后端不引 `@xyflow/react`，nodes/edges 当不透明 JSON。

## 编码规范

- 组件文件 PascalCase，函数组件具名导出。
- 新增节点类型需同步更新 `apps/web/src/lib/types.ts`、`nodes/index.ts`、`createNode()`(store)、`ProjectSidebar` 的 `NODE_GROUPS`；图像/视频类的预置模型在 `lib/nodeCatalog.ts`。（例外：`asset` 素材节点不走侧栏/`createNode`，由 `FlowCanvas` 拖拽经 `addAssetNode()` 创建。）
- 节点内可交互元素加 `nodrag` class。
- 不手改 `apps/web/src/components/ui/*`、`src/hooks/use-mobile.ts` 与 `index.css` 的 shadcn 主题块（生成内容，已在 eslint globalIgnores 排除）。
- 改后端 SQLite 表结构时注意已有数据兼容。
- 提交前确保根 `pnpm -r lint`、`pnpm -r typecheck`、`pnpm -r build` 通过。

## 后续可扩展（当前未做）
- 多用户 + 鉴权；流式输出（SSE）。
- 按连线拓扑顺序自动编排执行（把上游输出喂给下游）。
- 导入 / 导出工作流 JSON、撤销重做、暗色模式切换、更多节点类型。
