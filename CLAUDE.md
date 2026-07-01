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
apps/desktop/    桌面端外壳（Electron，打包 mac/win 安装包），包名 @openflow/desktop
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

# 桌面端（Electron）打包 —— 详见「桌面端打包」章节
pnpm --filter @openflow/desktop dist:mac   # 产 mac dmg/zip（arm64 + x64/Intel，未签名）到 apps/desktop/release
pnpm --filter @openflow/desktop dist:win   # 产 win nsis 安装包（x64，未签名，可在 mac 上交叉构建）
pnpm --filter @openflow/desktop dev        # Electron 开发（自动切 electron ABI + 连 Vite dev server:5173）
```

## 目录结构

```
packages/shared/src/index.ts   ProjectDTO / SettingsDTO(defaultReqFrom + aigcEndpoint/uploadEndpoint/uploadMediaEndpoint) / SaveSettingsBody(defaultReqFrom 必填 + 三端点可选，省略保持原值) / GenImageBody / GenVideoBody(含 audios → audio_list)
apps/server/src/
  index.ts                     独立开发入口（tsx，固定 8787）：调 startServer()，数据走源码相对目录；并 re-export createApp/startServer
  app.ts                       createApp({staticDir?})：挂 /api 路由 + 可选在根路径托管前端 SPA（供 Electron 生产用；HashRouter 故非 /api 路径统一回退 index.html，含目录穿越防护）
  server.ts                    startServer({port?,dataDir?,staticDir?})：先设 OPENFLOW_DATA_DIR 再动态 import app（保证 db 读到注入目录）；绑 127.0.0.1，port=0 时取空闲端口，返回 {port, close}
  db.ts                        better-sqlite3 建库建表（projects / settings）；数据目录 = env OPENFLOW_DATA_DIR（桌面端注入 userData）否则回退 apps/server/data/openflow.db（gitignore）；settings 表列 default_req_from + aigc/upload/upload_media_endpoint（按需 ALTER 迁移，旧 provider 列留存不读）
  settings-store.ts            读写 settings 单行（defaultReqFrom + 三端点）；writeSettings(patch) 合并写：只覆盖出现的字段
  provider.ts                  runImageGen()/runVideoGen()：POST AIGC 接口生成图像/视频（按 model 分支构造 payload；视频 audio_list 取自入参 audios；端点取入参 endpoint，空回退 env AIGC_ENDPOINT/内置）+ 从任意响应稳健解析 URL；uploadFiles(form,kind,endpointOverride?)：转发 multipart 到上传接口（端点取 override，空回退 UPLOAD_ENDPOINT / UPLOAD_MEDIA_ENDPOINT）；resolveReqFrom()：把全局署名解析成最终 req_from（空回退 env AIGC_REQ_FROM，再回退 'openflow'）
  routes/projects.ts           /api/projects CRUD（nodes/edges 以 JSON 存）
  routes/settings.ts           GET /api/settings(回 defaultReqFrom + 三端点) / PUT(defaultReqFrom 必填；端点省略保持原值、空串清空回退默认)
  routes/image.ts              POST /api/aigc(图像生成代理：Image 2/Nano Banana，按 model 补 version/config 转发 AIGC；req_from + aigcEndpoint 从全局设置注入；端点空回退 env AIGC_ENDPOINT)
  routes/video.ts              POST /api/video(视频生成代理：seedance，补 version/mode/config + audios→audio_list 转发 AIGC /aigc；req_from + aigcEndpoint 从全局设置注入)
  routes/upload.ts             POST /api/upload(文件上传代理：按 query kind 分流转发 multipart——图片→uploadEndpoint、音频(kind=audio)→uploadMediaEndpoint（均从设置注入，空回退对应 env）；req_from 从全局设置注入)
apps/web/src/
  main.tsx                     入口：先 migrateLocalStorage() 迁移旧数据，再 load store，最后渲染（HashRouter）
  App.tsx                      用 ReqFromGate 包裹路由（/ → 首页，/project/:id → 工作区，* → 回首页）
  store/useFlowStore.ts        Zustand（无 persist）：启动 loadProjects() 拉后端；增删改调 API；
                               画布编辑本地即时更新 + 防抖(500ms) PUT 保存激活项目；homeView 存 localStorage；
                               addAssetNode(kind,position)/removeNode(id) 供拖拽建/撤素材节点；载入时复位 asset 的 uploading
  store/useSettingsStore.ts    Zustand（无 persist）：loadSettings() 拉 defaultReqFrom + 三端点；saveSettings(部分字段) PUT 后回拉；saveReqFrom() 为其薄封装（端点由后端合并保留，供 ReqFromGate）
  lib/api.ts                   /api/* fetch 封装（项目 CRUD / 设置 get·save / 图像生成 generateImageApi / 视频生成 generateVideoApi / 文件上传 uploadFilesApi(files,kind)——图片默认走 /api/upload，音频 kind=audio 走 /api/upload-media）
  lib/graph.ts                 连线采集：collectUpstreamPrompt（上游文本）/ collectUpstreamImages（上游 image 结果 + 图像素材 URL 作输入图）/ collectUpstreamAudio（上游音频素材 URL 作 audio_list）
  lib/migrate.ts               首次启动把旧 localStorage（openflow-store）项目数据一次性导入后端，打 openflow-migrated 标记
  lib/types.ts                 React Flow 强类型节点（FlowNode = Prompt/Image/Video/Asset；AssetNodeData{kind:image|audio,url,fileName,uploading,error}；Project）
  lib/nodeCatalog.ts           图像/视频预置模型 + 模型→AIGC model_name 映射(IMAGE_API_MODEL/imageApiModel、VIDEO_API_MODEL/videoApiModel) + 各模型可调项选项(图像尺寸/质量/张数、Nano version/宽高比/尺寸、Seedance version/mode/分辨率/时长) + 配色文案（侧栏与节点共用，含素材节点 ASSET_NODE_META：图像=琥珀 / 音频=天蓝）
  components/ui/               shadcn/ui vendored（不参与 lint/format，勿手改）
  components/gate/ReqFromGate.tsx 启动强制填写 req_from：设置已加载且全局署名为空时全屏阻断弹窗，填写保存后放行（已填则不出现）
  components/settings/SettingsDialog.tsx 设置面板：全局 req_from（署名）+ AIGC 生成端点 / 图片上传端点 / 音频上传端点（端点留空=用服务端默认）输入 + 保存
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
apps/desktop/
  src/main.ts                  Electron 主进程：dataDir=userData → startServer(内嵌后端)；生产随机端口 + 托管 SPA 后 loadURL(localhost)，开发连 VITE_DEV_SERVER_URL(5173)；含 OPENFLOW_SELFTEST 无界面自检分支
  src/preload.ts               预加载：contextIsolation，仅暴露 window.openflow.desktop 标记（渲染进程只用 fetch 访问本地 /api）
  scripts/build.mjs            esbuild 把 main/preload + @openflow/server 打成 CJS(dist-electron/*.cjs，better-sqlite3/electron 外部化) + 拷 apps/web/dist → dist-electron/web
  scripts/sqlite-abi.mjs       在 Node/Electron ABI 间切 better-sqlite3（node=prebuild-install / electron=electron-rebuild）
  electron-builder.yml         打包配置：asar + better-sqlite3 解包(asarUnpack)；mac dmg/zip(arm64+x64,identity:null 未签名)、win nsis(x64 未签名)
```

## 技术约束

- **框架 / 构建**：React 19 + Vite + TypeScript（strict）；pnpm workspaces。
- **后端**：Hono + `@hono/node-server`，`tsx watch` 跑（免构建）；端口 8787。Vite dev 代理 `/api` → 8787（`apps/web/vite.config.ts`）。
- **数据库**：SQLite（`better-sqlite3`，单文件；开发在 `apps/server/data/openflow.db`，桌面端在 `userData` via env `OPENFLOW_DATA_DIR`）。`projects` 表 nodes/edges 存 JSON；`settings` 单行存 `default_req_from`(全局署名) + `aigc_endpoint`/`upload_endpoint`/`upload_media_endpoint`(可配置端点)。原生模块装不上时回退 Node 内置 `node:sqlite`。
- **数据流**：前端无 localStorage 持久化（仅 homeView + 迁移标记用 localStorage）。项目数据走 `/api/projects`；画布高频编辑防抖 PUT。全局 req_from 走 `/api/settings`。
- **生成调用**：图像 `/api/aigc`、视频 `/api/video`、文件上传 `/api/upload`（图片/音频按 `kind` 分流）均经后端代理转发到 AIGC 接口（绕 CORS）；req_from 由后端从全局设置注入（空回退 env `AIGC_REQ_FROM`）。**端点地址优先取全局设置里的 `aigcEndpoint`/`uploadEndpoint`/`uploadMediaEndpoint`，为空才回退 env（`AIGC_ENDPOINT`/`UPLOAD_ENDPOINT`/`UPLOAD_MEDIA_ENDPOINT`）再回退内置默认**——便于打包分发后由用户自填，不写死内网 IP。
- **启动门槛**：`ReqFromGate` 在设置加载后若 req_from 为空则全屏阻断，必须填写署名才放行。
- **路由**：`react-router-dom` `HashRouter`。
- **画布**：React Flow（`@xyflow/react`），节点是普通 React 组件；连线 smoothstep。
- **UI**：shadcn/ui（Tailwind v4）。新增组件 `pnpm dlx shadcn@latest add <name>`（在 apps/web 内）。
- **路径别名**：`@/*` → `apps/web/src/*`。
- **共享类型**：跨前后端的纯数据契约放 `packages/shared`；后端不引 `@xyflow/react`，nodes/edges 当不透明 JSON。

## 桌面端打包（Electron，`apps/desktop`）

- **原理**：Electron 主进程直接内嵌 `@openflow/server` 的 `startServer()`（同一进程跑 Hono），生产环境让它顺带在根路径托管 `apps/web` 构建产物，窗口 `loadURL(http://127.0.0.1:<随机端口>)`。→ 渲染进程 origin 即该 localhost，**现有前端相对 `/api` 调用零改动可用**。数据库落 `app.getPath('userData')`（经 `OPENFLOW_DATA_DIR` 注入）。
- **构建链**：esbuild 把 `main.ts`/`preload.ts` + 内联的 `@openflow/server` 打成 CJS（`.cjs`，`electron` 与 `better-sqlite3` 外部化）；`apps/web` 仍用自身 Vite 构建，产物拷进 `dist-electron/web`。`@openflow/server` 在 desktop 里是 **devDependency**（打包时被 esbuild 内联，运行时不需要）；唯一真正的运行时原生依赖是 `better-sqlite3`。
- **⚠️ 原生模块 ABI 冲突（重要）**：`better-sqlite3` 是编译过的原生模块，Node 与 Electron 的 ABI 不同，而 pnpm 让二者共用同一物理副本，**一次只能是一种 ABI**。故：
  - `pnpm dev:all` / `pnpm server`（普通 Node）需 **Node ABI**；`electron .` 与打包需 **Electron ABI**。
  - `scripts/sqlite-abi.mjs` 负责切换：`rebuild:node`（prebuild-install）/ `rebuild:electron`（electron-rebuild）。
  - `dist:mac`/`dist:win` **打包结束会自动 `rebuild:node` 还原**（打好的 app 已自带 Electron ABI 副本），故打包不破坏 `pnpm dev:all`；`pnpm --filter @openflow/desktop dev/start` 会先切 Electron ABI，用完想跑普通 Node 服务需手动 `pnpm --filter @openflow/desktop rebuild:node`。
- **分发**：当前 mac(arm64 + x64/Intel dmg/zip，各自内置对应 arch 原生模块) / win(x64 nsis) 均 **未签名**（内部自用）；mac 首次打开需右键「打开」绕过 Gatekeeper，win 点「仍要运行」绕过 SmartScreen。产物在 `apps/desktop/release/`（gitignore；x64 dmg 无 arch 后缀 `OpenFlow-<ver>.dmg`，arm64 为 `-arm64.dmg`）。正式对外分发需另配 Apple Developer ID 公证 + Windows 代码签名证书。
- **端点分发友好**：内网 AIGC/上传地址不写死，改由设置面板填（存后端 settings）；打包发给不同网络的人也能自行改地址。
- **pnpm 注意**：`@electron/rebuild` 用 git 引用 `@electron/node-gyp`，`pnpm-workspace.yaml` 里用 `overrides` 覆盖成 npm 发布版绕开 exotic-subdep 拦截；`electron` 的 postinstall 需在 `allowBuilds` 放行。

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
