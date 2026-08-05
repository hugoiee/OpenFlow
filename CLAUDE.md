# OpenFlow

节点式 AI 工作流画布编辑器：支持多个项目，每个项目是一块画布，可在画布上添加节点
（节点列表按输出形态分三类：**文本** Prompt 节点 + Any LLM 节点 / **图像** 生成节点 / **视频** 生成节点）并用连线把
节点连接起来。**选中多个节点右键**可对其**分组**（建一个容器节点包住、一起移动/改名/取消分组）或**整理**（网格排列）。**Any LLM 节点**：把上游 Prompt/LLM 文本喂给一个 OpenAI 兼容模型产出文本（左入右出，输出经连线可作下游节点的 prompt）；
节点卡片展示回答（思考文本若返回则折叠展示），节点左侧还有图像/音频/视频多模态输入端点（连图像/音频/视频素材，「Add Input」三按钮增减，随请求作 image_url/audio_url/video_url 内容块下发）；
选中时右侧 Inspector 面板调 Model（下拉：手动列表 ∪ 端点动态获取，选项后缀能力图标标注思考/图像/音频/视频理解）/ Temperature（滑块）/ Thinking（开关，开启发 reasoning_effort 原生推理参数）；
调用**复用画布 Agent 的 endpoint/key**（不需 req_from），走异步任务（同图像/视频，刷新不丢结果）。**上传资源现在只有一种方式**：从桌面**拖入图像/音频/视频文件到画布空白处**，经 /api/upload 上传后在落点生成 **素材节点**（图像素材 / 音频素材 / 视频素材，纯「源」节点；视频走媒体上传端点），
再**连线**到下游节点作输入——图像素材作输入图、音频素材作视频 audio_list；三者还可连到 **Any LLM 节点**的图像/音频/视频输入端点作多模态理解输入。（不再支持「拖到已有节点上追加输入」，也不在 Inspector 里上传/手填 URL——资源一律先落素材节点、经连线喂给下游。）
图像类的 **Image 2(gpt-image-2)** 与 **Nano Banana(nano-banana)**、视频类的 **Seedance(seedance)** 均已接入真实生成
（经后端代理调 AIGC 接口；prompt 取自上游 Prompt 节点，节点上可调各自参数，输入图/音频均来自连线（上游图像素材·生成结果 / 音频素材），运行后展示结果图/视频）。
调用方署名 **req_from** 为全局设置（首次打开网站若未填则强制填写，存后端单例 settings；图像/视频生成与图片上传统一由后端注入）。
工作区右侧有**画布 Agent 聊天面板**（可收起，偏好存 localStorage）：用自然语言说想法/想要的画面，后端调 OpenAI 兼容 LLM 产出
`{reply, actions}` 计划，前端把每个 action 落成一组「Prompt 节点（写好提示词）→ 图像节点（Agent 选模型）」并连线、建生图任务，
结果沿用节点自身的 taskId 重连轮询展示；Agent 的接口地址/API Key/模型名在设置面板配置。
**播客 TTS（火山）节点**（音频类）：节点内置双人对话脚本（每行「角色名: 台词」，支持 [轻笑] 等方括号表演指令透传），右侧 Inspector 配两个角色的火山音色 ID + 语速；运行走异步任务，后端逐行调火山单向流式 TTS（seed-tts-2.0）合成 pcm、行间插静音拼成整期 WAV 落盘（<数据目录>/files，经 GET /api/files/:name 同源服务），节点 <audio> 播放 + 下载；鉴权用设置里的火山语音 API Key（写入-only，env 回退 VOLC_TTS_API_KEY），不需要 req_from；终端节点（无连接点）。顶栏还有 **Prompt 预设** 库（全局共享的常用/System 提示词，Prompt 节点卡片可一键选用或「存为预设」；存后端 `prompt_presets` 表、首次启动播种默认 3 条）。
图像/视频结果卡片有**下载**按钮（经后端 `/api/download` 同源代理跨域拉流、按响应类型自动补扩展名、可自定义文件名）。**前后端架构**：
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
pnpm --filter @openflow/desktop dist:win   # 产 win nsis 安装包（x64，未签名；在 mac 上交叉构建：先拉 win 预编译 better-sqlite3 再打包）
pnpm --filter @openflow/desktop dev        # Electron 开发（自动切 electron ABI + 连 Vite dev server:5173）
```

## 目录结构

```
packages/shared/src/index.ts   ProjectDTO / SettingsDTO(defaultReqFrom + aigcEndpoint/uploadEndpoint/uploadMediaEndpoint + agentEndpoint/agentApiKey/agentModel) / SaveSettingsBody(defaultReqFrom 必填 + 其余可选，省略保持原值) / GenImageBody / GenVideoBody(含 projectId/nodeId + audios → audio_list) / GenLlmBody(projectId/nodeId + model/prompt/systemPrompt? + images?/audios?/videos? 多模态输入 + temperature/thinking) / TaskDTO(id/projectId/nodeId/kind/status/result/error；llm 的 result=[回答] 或 [回答,思考]) + TaskKind('image'|'video'|'llm'|'podcast') + 播客契约(PodcastRole{name,voiceId} / GenPodcastBody{projectId/nodeId/script/roles×2 + 可调项 speechRate/sampleRate/loudnessRate/pitch/lineGapMs(本地句间静音)/filterParenthesis/disableMarkdownFilter/disableEmojiFilter/explicitLanguage/contextText(语音指令，UI 已隐藏字段保留)/aigcWatermark/aigcMetadata{enable+四元信息字段}，全部可省略走默认}；podcast 任务 result=[音频 URL, 计费字数(各句 usage.text_words 合计)]) + SettingsDTO.volcTtsApiKey(写入-only，GET 恒空串 + hasVolcTtsApiKey) + TaskStatus + CreateTaskResponse + 画布 Agent 契约(AgentMessage / AgentChatBody / AgentImageAction{prompt,model,title?} / AgentChatResponse{reply,actions} + 连接测试 AgentTestBody·AgentTestResponse + 动态模型列表 AgentModelsBody{endpoint?,apiKey?}·AgentModelsResponse{models}) + Prompt 预设契约(PromptPresetCategory 'common'|'system' / PromptPresetDTO{id,title,content,category,时间戳} / SavePromptPresetBody{title 必填 + content/category 可选})
apps/server/src/
  index.ts                     独立开发入口（tsx，固定 8787）：调 startServer()，数据走源码相对目录；并 re-export createApp/startServer
  app.ts                       createApp({staticDir?})：挂 /api 路由（含 /api/tasks）+ import './task-store'（启动即对账中断任务）+ 可选在根路径托管前端 SPA（供 Electron 生产用；HashRouter 故非 /api 路径统一回退 index.html，含目录穿越防护）
  server.ts                    startServer({port?,dataDir?,staticDir?})：先设 OPENFLOW_DATA_DIR 再动态 import app（保证 db 读到注入目录）；绑 127.0.0.1，port=0 时取空闲端口，监听失败（端口被占）reject 供调用方回退，返回 {port, close}
  db.ts                        better-sqlite3 建库建表（projects / settings / tasks / prompt_presets）；数据目录 = env OPENFLOW_DATA_DIR（桌面端注入 userData）否则回退 apps/server/data/openflow.db（gitignore）；settings 表列 default_req_from + aigc/upload/upload_media_endpoint + agent_endpoint/api_key/model + agent_model_list(JSON 手动模型列表，默认 '[]')（按需 ALTER 迁移，旧 provider 列留存不读）；tasks 表(id/project_id/node_id/kind/status/params/result/error/时间戳 + node 索引)；prompt_presets 表(id/title/content/category/时间戳；早期无 category 列 → ALTER 补默认 'common')
  settings-store.ts            读写 settings 单行（defaultReqFrom + 三端点 + agent 三项 + agentModelList 手动模型列表，存 JSON 字符串，读时 parse/去空去重、写时 stringify）；writeSettings(patch) 合并写：只覆盖出现的字段
  preset-store.ts              Prompt 预设持久层：SQLite 表 prompt_presets(id/title/content/category/created_at/updated_at)；listPresets(updated_at DESC)/createPreset/updatePreset/deletePreset + seedDefaultPresets()（首次启动仅表空时灌入 default-presets）
  default-presets.ts           分发预设默认内容数组（3 条：人物三视图+特写 / 人像写真 常用 Prompt + 资深提示词工程师 system prompt；数组顺序=列表顺序）
  agent.ts                     runAgentChat(messages, settings)：POST OpenAI 兼容 /chat/completions（端点按 URL pathname 判断/补后缀，保住查询串如 Azure ?api-version=；设置优先 → env AGENT_ENDPOINT/AGENT_API_KEY/AGENT_MODEL；端点或模型缺失抛「请在设置中填写」；apiKey 非空才带 Bearer；网络失败/超时/非 JSON 响应均翻译成含地址与原因的中文错误）；系统提示词要求严格 JSON 计划 + 容错解析（extractJsonObject 从首个 { 起做括号平衡扫描——容忍 ``` 围栏与 JSON 后追加的说明文字；非 JSON 时整段当 reply 且 actions 空）+ normalizeActions（无 prompt 丢弃、model 归一为 Image 2/Nano Banana、单轮上限 8 个动作）；另导出 runAgentConnectionTest（最小用量连接测试）与 listAgentModels(override, settings)（调端点 GET /models 列可用模型 ID，兼容 {data:[{id}]}/数组/字符串数组、去重排序、空/失败抛可读错误）+ resolveModelsUrl（从端点推导 /models 地址，剥 /chat/completions、保查询串）
  task-store.ts                异步生成任务持久化 + 进程内 runner：createTask/getTask/getLatestTaskForNode；startTask(不 await 地后台跑 runImageGen/runVideoGen/runLlmCompletion 按 kind 分支，reqFrom/端点运行时从设置解析不入库，完成回写 succeeded/failed；llm result 打包成 [回答] 或 [回答,思考])；reconcileInterruptedTasks()（模块加载时调一次：残留 pending/running 标 failed「任务因服务重启中断」）
  llm.ts                       runLlmCompletion({model,prompt,systemPrompt?,images?,audios?,videos?,temperature,thinking,settings})：Any LLM 节点的文本补全，复用画布 Agent 的 endpoint/key（设置优先→env AGENT_ENDPOINT/AGENT_API_KEY，端点缺失抛「请在设置中填写」）；有图/音/视输入时 user 内容改成多模态内容块数组（image_url / audio_url / video_url——键名各网关略异，不认可可在此调整）否则纯文本；thinking=true 时请求体带 reasoning_effort:'medium'；解析回答(content)与思考(reasoning_content/reasoning/thinking)回传（复用 agent.ts 导出的 resolveChatCompletionsUrl/extractLlmError）
  provider.ts                  runImageGen()/runVideoGen()：POST AIGC 接口生成图像/视频（按 model 分支构造 payload；视频 audio_list 取自入参 audios；端点取入参 endpoint，空回退 env AIGC_ENDPOINT/内置）+ 从任意响应稳健解析 URL；uploadFiles(form,kind,endpointOverride?)：转发 multipart 到上传接口（kind=image 走图片端点，audio/video 走媒体端点；端点取 override，空回退 UPLOAD_ENDPOINT / UPLOAD_MEDIA_ENDPOINT）；resolveReqFrom()：把全局署名解析成最终 req_from（**为空即抛错、无兜底默认**——req_from 空时不允许发任何上游请求）
  routes/projects.ts           /api/projects CRUD（nodes/edges 以 JSON 存）
  routes/settings.ts           GET /api/settings(回 defaultReqFrom + 三端点 + agent 配置 + agentModelList；**agentApiKey 不回明文**——恒空串 + hasAgentApiKey 标记) / PUT(defaultReqFrom 必填；其余省略保持原值、空串清空回退默认；agentModelList 传数组则整体覆盖 trim/去空/去重、含空数组=清空)
  routes/image.ts              POST /api/aigc(图像生成：校验 model/prompt/projectId/nodeId + req_from 空返回 400 拒发 → createTask/startTask 建任务、立刻返回 {taskId}；实际 AIGC 由 task-store runner 后台跑)
  routes/video.ts              POST /api/video(视频生成 seedance：同 image.ts 建任务返回 {taskId}，kind=video)
  routes/llm.ts                POST /api/llm(Any LLM 文本生成：校验 model/prompt/projectId/nodeId → createTask/startTask 建任务返回 {taskId}，kind=llm；复用 Agent 配置不需 req_from，未配置时由后台任务给出可读失败)
  routes/tasks.ts              GET /api/tasks/:id(轮询单任务，缺失 404) / GET /api/tasks?projectId=&nodeId=(取节点最近一次任务，重连兜底)
  routes/upload.ts             POST /api/upload(文件上传代理：按 query kind 分流转发 multipart——图片(kind=image)→uploadEndpoint、音频/视频(kind=audio|video)→uploadMediaEndpoint（均从设置注入，空回退对应 env）；req_from 从全局设置注入，为空返回 400 拒发)
  routes/agent.ts              POST /api/agent/chat(画布 Agent 对话：过滤非法消息并截取最近 20 条历史 → runAgentChat 同步调 LLM 返 {reply,actions}；配置缺失 400、上游失败 502；本接口不建任务——画布动作与生图任务由前端执行) / POST /api/agent/test(最小用量连接测试) / POST /api/agent/models(动态获取模型列表：body 可带 endpoint/apiKey override，省略回退已存设置 → listAgentModels 返 {models}；配置缺失 400、上游/端点不支持 502)
  routes/podcast.ts            POST /api/podcast(播客音频生成：校验 script/roles×2 + 火山 Key 缺失 400 早失败 → createTask/startTask 建任务返回 {taskId}，kind=podcast；不需要 req_from)
  routes/files.ts              GET /api/files/:name(后端生成文件的同源服务：<数据目录>/files 下按文件名取，防目录穿越；播客 WAV 经此播放/下载)
  volc-tts.ts                  播客合成核心：resolveVolcTts(设置 volcTtsApiKey 优先→env VOLC_TTS_API_KEY，缺失抛可读错误；端点 env VOLC_TTS_ENDPOINT 回退官方地址) / parsePodcastScript(每行「角色名: 台词」中英冒号均可、长角色名优先匹配、无前缀行并入上一句、首句无法识别抛错) / runPodcastGen(逐行串行调火山单向流式 HTTP 拿 base64 pcm——流式 JSON 包括号平衡解析、code 0/20000000(结束包) 之外才抛错，行间插句间静音(lineGapMs 默认 300ms)拼单声道 16bit WAV 落盘，返回 /api/files/xxx.wav)；每句请求带 audio_params{sample_rate/speech_rate/loudness_rate} + additions(JSON 字符串，仅非默认项：括号过滤/markdown/emoji/explicit_language) + post_process.pitch(非 0 才发) + context_texts(语音指令) + additions.aigc_watermark/aigc_metadata(meta 水印不支持 pcm——enable 时每句改按 wav 请求、wavToPcm 解出 data 块再拼接)；每句结束包 usage.text_words 累加随结果返回
  routes/prompt-presets.ts     Prompt 预设 CRUD：GET /api/prompt-presets(列表) / POST(新建) / PUT /:id(更新) / DELETE /:id；parseBody 校验(title trim 非空、content 允许空、category 归一为 'common'|'system')
  routes/download.ts           GET /api/download?url=&kind=&name=(下载同源代理：fetch 跨域结果资源流式回传 + 按 Content-Type/URL 后缀/kind 推断扩展名 + 清洗文件名去路径分隔/保留字 + Content-Disposition 用 RFC 5987 filename* 兼容中文)
apps/web/src/
  main.tsx                     入口：先 migrateLocalStorage() 迁移旧数据，再 load store，最后渲染（HashRouter）
  App.tsx                      用 ReqFromGate 包裹路由（/ → 首页，/project/:id → 工作区，* → 回首页）
  store/useFlowStore.ts        Zustand（无 persist）：启动 loadProjects() 拉后端；增删改调 API；
                               groupSelectedNodes/ungroupNode/arrangeSelectedNodes：选中多节点分组（建 group 容器 + 子节点设 parentId/extent、坐标转相对、容器排在子节点前）/ 取消分组（detachChildren 释放子节点转绝对 + 删容器）/ 整理（computeGridLayout 网格排列）；onNodesChange 拦截 group 删除时先 detachChildren 释放子节点（防 parentId 悬空错位）；
                               画布编辑本地即时更新 + 防抖(500ms) PUT 保存激活项目；homeView 存 localStorage；
                               addAssetNode(kind,position)/removeNode(id) 供拖拽建/撤素材节点；duplicateNode(id) 在原节点正右侧（让开 nodeSize 整宽 + ARRANGE_GAP，不重叠）复制一份副本（换新 id、保留参数与结果快照、清 taskId/运行态、选中态转副本；group 容器跳过）；addAgentGeneration({prompt,model,title?}) 供 Agent 在现有内容下方建「Prompt→图像」节点对并连线、返回两节点 id（摆放按 measured.height/兜底高度找底部空位）；updateNodeDataInProject(projectId,nodeId,data) 显式按项目写节点 data（异步回调防「等待期间切走画布」丢写）；载入时复位 asset 的 uploading 与 image/video 的 running/error（但**保留 taskId/result**，供节点重连未完成任务）
  store/useSettingsStore.ts    Zustand（无 persist）：loadSettings() 拉 defaultReqFrom + 三端点 + agent 三项 + agentModelList（手动模型列表，持久）；saveSettings(部分字段) PUT 后回拉（并使动态模型列表失效重取）；saveReqFrom() 为其薄封装（其余字段由后端合并保留，供 ReqFromGate）；另持有动态模型列表 agentModels/agentModelsLoading/agentModelsLoaded/agentModelsError + loadAgentModels(override?)（调 listAgentModelsApi，失败不抛、置空列表 + 存 error 供 UI 回退手填；设置面板与 Any LLM 节点共用这一份）
  store/useAgentStore.ts       Zustand（无 persist）：画布 Agent 会话（conversations 按 projectId 分、仅存内存刷新即清）+ sending 态 + panelOpen（存 localStorage openflow-agent-panel）；send() = agentChatApi 拿计划 → executeAgentActions 落画布 → 把 reply/执行结果（成功组数 okCount、失败信息 actionErrors）追加进会话；有动作的 assistant 轮以 llmContent 存完整 JSON 计划回灌 LLM 历史（供「照上一张改」类追问拿到 prompt 全文，展示仍用短 reply）；错误提示条不进 LLM 历史，且历史构建时合并连续同角色消息（严格网关要求角色交替）
  store/useThemeStore.ts       Zustand：主题偏好 mode(light/dark/system) 存 localStorage(openflow-theme)；resolved 为实际明暗（system 已按 prefers-color-scheme 解析，供 React Flow colorMode）；创建即给 <html> 挂/摘 .dark 并监听系统明暗变化（index.html 另有防白闪内联脚本在首帧前先挂类）
  store/usePromptPresetStore.ts Zustand（无 persist）：Prompt 预设全局库（presets + loaded + loadPresets/addPreset/editPreset/removePreset）；走 /api/prompt-presets CRUD，乐观更新，新建/编辑后置顶（updated_at DESC 对齐后端）
  lib/api.ts                   /api/* fetch 封装（项目 CRUD / 设置 get·save / 图像·视频·LLM 异步任务 createImageTaskApi·createVideoTaskApi·createLlmTaskApi 建任务返 taskId、getTaskApi 轮询、getLatestTaskForNodeApi 按节点重连 / agentChatApi(Agent 对话，同步返 {reply,actions}) / testAgentConnectionApi(连接测试) / listAgentModelsApi(动态取模型列表，POST /agent/models) / 文件上传 uploadFilesApi(files,kind)——图片默认走 /api/upload，音频 kind=audio 走 /api/upload-media / Prompt 预设 CRUD listPromptPresetsApi·createPromptPresetApi·updatePromptPresetApi·deletePromptPresetApi）
  lib/requestBody.ts           生成请求体的**单一来源**：buildLlmRequest/buildImageRequest/buildVideoRequest 构造「点击生成时发送的请求 JSON」（收集上游 Prompt/图像/音频/视频 + 按模型整合参数；LLM 请求含 images/audios/videos 多模态输入）；节点 handleRun 与 Inspector「请求预览」共用，保证预览=实发不漂移
  lib/agentExecutor.ts         executeAgentActions(projectId, actions)：把 Agent 计划落到画布——逐动作 addAgentGeneration 建节点连线 → createImageTaskApi 建任务（参数与 ImageNode 手动运行同构，按模型分组）→ updateNodeData 写 taskId（轮询/展示由 ImageNode 的 taskId 重连 effect 接管，节点组件零改动）；等待期间画布切走则跳过该动作；建任务失败把错误写到节点 data 内联展示
  lib/taskPolling.ts           pollTask(taskId,{onUpdate?,signal})：递归 setTimeout 轮询任务至终态（起 1500ms×1.3 退避封顶 5000ms；瞬时错误重试；signal abort 可取消）
  lib/graph.ts                 连线采集：collectUpstreamPrompt（上游 prompt 文本 + 上游 Any LLM 节点输出文本；prompt 有左侧输入→递归并入其上游文本实现 Prompt 链，LLM 结果为终点不回溯，visited 防环）/ collectUpstreamImages（上游 image 结果 + 图像素材 URL 作输入图）/ collectUpstreamAudio（上游音频素材 URL 作 audio_list / LLM 音频输入）/ collectUpstreamVideo（上游 video 生成节点(Seedance) 结果 + 视频素材 URL 作 LLM 视频输入）；端点 id 前缀 image-/audio-/video-（imageInputHandleId/audioInputHandleId/videoInputHandleId）
  lib/handleTypes.ts           端点数据类型↔配色 + 连接校验：HANDLE_COLORS（文本粉 / 图像绿 / 音频蓝 / 视频玫红）+ sourceKind/targetAccepts/edgeColorForSource/isValidTypedConnection（图像端点只接图像源、音频端点只接音频源、视频端点只接视频源、文本端点只接文本源，供 FlowCanvas 连线校验与着色）
  lib/migrate.ts               首次启动把旧 localStorage（openflow-store）项目数据一次性导入后端，打 openflow-migrated 标记
  lib/types.ts                 React Flow 强类型节点（FlowNode = Prompt/Llm/Image/Video/Asset/Group；LlmNodeData{model,temperature,thinking,imageInputs?/audioInputs?/videoInputs?(多模态输入端点计数：图像默认≥1、音频/视频 0 起步),running,result,reasoning,error,taskId}；AssetNodeData{kind:image|audio|video,url,fileName,uploading,error}；GroupNodeData{label}(分组容器)；Project）；图像/视频/LLM 节点 data 另含 imageInputs/audioInputs（输入端点计数，「Add Input」按钮递增）+ imagesText/audiosText（旧手填 URL，兼容保留、无新增 UI）
  lib/layout.ts                节点布局纯计算（供分组/整理复用）：nodeSize(measured→width/height→按类型兜底) / computeBoundingBox(绝对包围盒) / computeGridLayout(按位置排序后 ceil(√n) 列的等间距网格) / detachChildren(子节点相对坐标转绝对、清 parentId/extent) + GROUP_PADDING/ARRANGE_GAP
  lib/nodeCatalog.ts           图像/视频预置模型 + 模型→AIGC model_name 映射(IMAGE_API_MODEL/imageApiModel、VIDEO_API_MODEL/videoApiModel) + 各模型可调项选项(图像尺寸/质量/张数、Nano version/宽高比/尺寸、Seedance version/mode/分辨率/时长) + Any LLM 预置模型 LLM_MODELS（现仅作**新建节点默认种子**：Model 选择已改为动态）+ mergeModelOptions(manual, fetched, current)（把手动列表 ∪ 动态获取合并成下拉候选：去空/去重/排序 + 当前已选值置顶；设置面板与节点共用保证一致）+ Temperature 范围 + 配色文案（侧栏与节点共用，含素材节点 ASSET_NODE_META：图像=琥珀 / 音频=天蓝 / 视频=玫红；LLM_NODE_META：紫色）
  lib/modelCapabilities.ts     modelCapabilities(name)：按模型名正则**启发式推断**支持的能力（思考/图像/音频/视频理解，常见家族 gpt-4o/gemini/claude/o系列/deepseek/qwen-omni 等，未知模型全 false）+ hasAnyCapability + MODEL_CAPABILITY_LABELS/ORDER（供 Model 下拉展示能力图标；规则近似、易维护）
  lib/nodeMenu.ts              NODE_GROUPS：侧栏拖拽建节点 + 画布右键菜单点选建节点共用的分组清单（按文本/图像/视频三类，含类型/模型/图标/videoVariant）
  lib/id.ts                    newId(prefix)：生成简短唯一 id（项目/节点/连线用）
  lib/appMeta.ts               应用元信息常量：APP_NAME='Open Flow' / APP_VERSION（顶栏/侧栏 logo 展示；与 apps/desktop/package.json 的打包版本保持一致，发版时两处一起改）
  lib/utils.ts                 cn()：clsx + tailwind-merge 合并去重类名（shadcn 约定）
  hooks/useResizableWidth.ts   右侧停靠面板宽度可调 hook：宽度存 localStorage 跨会话保留 + onPointerDownResize 拖左缘手柄改宽（供 NodeInspector）
  components/ui/               shadcn/ui vendored（不参与 lint/format，勿手改）
  components/gate/ReqFromGate.tsx 启动强制填写 req_from：设置已加载且全局署名为空时全屏阻断弹窗，填写保存后放行（已填则不出现）
  components/settings/SettingsDialog.tsx 设置面板：全局 req_from（署名）+ AIGC 生成端点 / 图片上传端点 / 音频上传端点 + Agent 接口地址（OpenAI 兼容）/ Agent API Key（password 框，**写入-only**：不回显、留空=保持已存值、placeholder 按 hasAgentApiKey 提示）/ Agent 模型名（**下拉**：候选 = 手动维护的「模型列表」(下方 textarea 每行一个、持久化) ∪ 端点 GET /models 动态获取(「获取模型列表」按钮，进 API 分区自动、用当前表单 endpoint/key 作 override 支持存前预览)，经 mergeModelOptions 去重排序 + 已选值置顶；**不支持 /models 的网关靠手动列表也能得到多选下拉**）+ 保存
  components/presets/PromptPresetsDialog.tsx  Prompt 预设管理弹窗（顶栏「预设」按钮打开）：顶部新增/编辑表单（含「常用/System」分组选择）+ 下方按两组列出预设（编辑/删除）；预设为全局共享库，Prompt 节点可下拉一键选用或「存为预设」
  components/agent/AgentChatPanel.tsx    画布 Agent 聊天面板（AgentChatPanel：工作区右侧 360px 固定栏，头部收起按钮 + 消息气泡（用户右/助手左，执行反馈与失败信息小字）+ 输入区（Enter 发送、Shift+Enter 换行、输入法组词不误发）；AgentChatToggle：收起时画布右下角悬浮 Bot 按钮）
  components/theme/ThemeToggle.tsx 主题切换下拉（浅色/深色/跟随系统三选一；首页头部与工作区侧栏共用，图标随实际明暗变化）
  components/home/             HomePage（宫格/列表 + 新建）、ProjectCard
  components/workspace/ProjectWorkspace.tsx  Sidebar + 顶栏 WorkspaceHeader + 画布 + Agent 面板；SidebarInset 为 flex-row：画布区（relative flex-1，内含 SidebarTrigger/NodeInspector/AgentChatToggle 绝对定位）+ AgentChatPanel 固定宽靠右（NodeInspector 吸附画布区右缘，与聊天面板并排不重叠）；未 loaded 前不跳首页
  components/workspace/WorkspaceHeader.tsx   工作区顶栏：左=侧栏开合 + 首页 + **可点击改名的项目名**（单击编辑，Enter 提交 / Esc 取消）；右=req_from 邮箱前缀 badge(点开设置 + 退出) · **预设按钮**(开 PromptPresetsDialog) · 主题切换 · 设置按钮(开 SettingsDialog)
  components/workspace/AppLogo.tsx            品牌标记：流程图 favicon SVG + APP_NAME + APP_VERSION（顶栏/侧栏共用，点击回首页）
  components/projects/ProjectSidebar.tsx     工作区 Sidebar：返回首页 + 节点列表（按文本/图像/视频三类分组，**拖拽**对应卡片到画布建节点并预设模型；纯拖拽无点按，不再显示项目列表）
  components/canvas/
    FlowCanvas.tsx             React Flow 封装；连线默认 bezier 曲线（default，旧 straight/smoothstep 载入时归一成曲线）+ 加粗；悬停高亮、与「已选中节点」相连的边高亮 + 蚂蚁线流动（渲染时按 node.selected 派生 animated/edge-active，不入库；样式在 index.css）；colorMode 跟随主题（useThemeStore.resolved，画布底纹/控制按钮/缩略图随暗色）；onDragOver/onDrop 接桌面拖入文件（按 MIME 分图像/音频/视频，screenToFlowPosition 定位，**一律在落点建素材节点**并经 /api/upload 上传写回 URL（视频走媒体端点）——不再按落点区分「拖到节点上追加」；侧栏拖来的 application/openflow-node 走建节点分支）；onPaneContextMenu 出加节点菜单，onNodeContextMenu/onSelectionContextMenu 在选中多节点时出「选中操作」菜单（分组/整理/取消分组，两菜单互斥）；**鼠标/触控板双操作模式**（鼠标=滚轮缩放；触控板=panOnScroll 双指平移 + zoomOnPinch 捏合缩放，偏好存 localStorage openflow-trackpad，默认鼠标模式，由 ZoomSlider 按钮切换）
    CanvasContextMenu.tsx      画布空白右键菜单：分组节点清单，点选即在落点加节点（含拉线松开在空白处的建节点+连线）
    SelectionContextMenu.tsx   选中节点右键菜单：分组 / 整理（网格排列）/ 取消分组（按选中情况显隐；≥2 非容器节点才可分组/整理，选中/点中容器才可取消分组）
    ZoomSlider.tsx             左下角缩放面板：−/滑块/+/百分比复位/适配视图 + 鼠标/触控板模式切换（图标随模式换 Mouse/Touchpad）与网格吸附、缩略图开关（偏好由 FlowCanvas 存 localStorage）
    DownloadDialog.tsx         下载/重命名对话框（受控 open + DownloadTarget）：用户只改文件名、扩展名由后端按响应类型自动补；triggerDownload 经 /api/download 同源代理触发浏览器下载（供图像/视频结果卡片）
    nodes/PromptNode.tsx       Prompt 节点（Card + Textarea）：左侧 target Handle 输入 + 右侧 source Handle 输出（左入右出，天蓝）；上游 Prompt/LLM 文本可连入，经 collectUpstreamPrompt 递归并入下游（Prompt 链）；卡片可从 **Prompt 预设**库一键选用（写入文本框）或把当前文本「存为预设」(分常用/System，usePromptPresetStore)
    nodes/LlmNode.tsx          Any LLM 节点：卡片展示回答文本（思考文本若返回则 <details> 折叠）+ 复制按钮；左侧输入端点 Prompt/System Prompt + 图像(image-)/音频(audio-)/视频(video-) 三种多模态输入端点（「Add Input」三按钮各自递增 imageInputs/audioInputs/videoInputs，图像默认≥1、音视频 0 起步）；运行收集上游 Prompt/LLM 文本 + 图/音/视素材→createLlmTaskApi 建任务→pollTask 轮询→展示；带 taskId 载入时 useEffect 重连轮询（重连路径失败 silent、点击运行失败弹窗）；Model/Temperature/Thinking 参数在右侧 Inspector 编辑
    nodes/ImageNode.tsx        图像生成节点：输入图**来自连线**（上游图像素材/生成结果，右侧 Inspector 的 ImageInput 只读预览，不再上传/手填 URL）/按模型(Image 2 走尺寸/质量/张数；Nano Banana 走 version/宽高比/尺寸)；运行收集上游 Prompt 文本→createImageTaskApi 建任务→pollTask 轮询→展示结果图；带 taskId 载入时 useEffect 重连轮询（关页面不丢结果；重连/Agent 触发路径失败 **silent 不弹 alert** 只节点内联报错，点击运行路径失败仍弹窗）；Handle 左进右出（req_from 署名走全局设置，节点不再单设）
    nodes/SeedanceNode.tsx     视频生成节点（seedance）：输入图/输入音频**均来自连线**（上游图像素材·生成结果 / 音频素材，经节点左侧端点连入；Inspector 只有 version/mode/分辨率/时长参数，无上传/手填 UI）；运行时输入图 = 上游图像(连线)、音频 = 上游音频素材(连线) 作 audios→createVideoTaskApi 建任务→pollTask 轮询→<video> 展示；带 taskId 载入时 useEffect 重连轮询；Handle 左进右出——**右侧 Video 输出端点为视频源（玫红），可连下游 Any LLM 节点的视频输入端点**（sourceKind(video)='video'，结果视频经 collectUpstreamVideo 喂给下游）；req_from 署名走全局设置，节点不再单设
    nodes/PodcastNode.tsx      播客音频节点（火山 TTS）：内置脚本 Textarea（useCompositionField 防抖+IME）+ 运行 →createPodcastTaskApi 建任务→pollTask 轮询→<audio> 播放 + 下载（同源 URL 直接 <a download>）+ 计费字数展示（result[1]）；带 taskId 载入时重连轮询；NodeResizer 可调大小；终端节点无 handle（结果是相对 URL，发不去外部网关故不作下游输入源；addConnectedNode 对 podcast 特判不连线）
    nodes/AssetNode.tsx        素材节点（桌面拖入）：图像素材显示缩略图 / 音频素材显示 <audio> / 视频素材显示 <video>；上传中骨架、失败内联；仅右侧 source Handle（纯源，图像绿/音频蓝/视频玫红，连下游作输入）
    nodes/GroupNode.tsx        分组容器节点：半透明虚线框包住子节点（子节点 parentId 指向它、渲染在其上方，拖框子节点跟随）；顶部工具条改名 + 取消分组；NodeResizer 可调大小；无连接点
    nodes/NodeHeader.tsx       各节点共用卡片头部：图标 + 名称（**双击重命名**：内联 input 编辑 data.label，Enter/blur 提交、Esc 取消、IME 守卫、trim 空放弃；双击 stopPropagation 防触发画布双击缩放）+ 可选 subtitle 小字副标题（Image/Video/LLM 的模型名、素材的文件名——标题让位给 label 后原信息降级到此）+ 复制 + 删除按钮（默认隐藏，hover/选中时显示）；复制按钮调 duplicateNode()——在原节点正右侧（让开整宽 + 间距，不重叠）生成副本，保留参数与结果快照、清 taskId/运行态，选中态转到副本（group 容器无此头部故不可复制）
    nodes/NodeHandle.tsx       统一端点：环形连接点 + 外侧标签；type(target/source) + index(竖向槽位) + tone(粉/绿/蓝) + required(必填端点实心)
    nodes/ImageInputHandles.tsx 编号输入端点组（image-/audio-/video- 三种 kind，含 ImageInputHandles/AudioInputHandles/VideoInputHandles）+ AddInputControls：暴露「Add Input:」图标按钮组（image/audio/video 三个按钮，传入哪个计数就显示哪个），点按 updateNodeData 递增 imageInputs/audioInputs/videoInputs → 节点重渲多出一个 NodeHandle（**Add Input 按钮通过计数字段反向驱动端点增减**）。**⚠️ 用这些动态端点的节点（LlmNode/ImageNode/SeedanceNode）必须在端点数变化后调 `useUpdateNodeInternals()(id)` 重新测量**——否则挂载后新增的 handle 只在 DOM 存在、不进 React Flow 的 handleBounds 连接登记，无法连线（image 默认≥1 挂载即登记故不易发现）
    nodes/handleLayout.ts      端点竖向布局常量/计算：HANDLE_TOP_START=48 + HANDLE_GAP=32 + handleTop(index)/handleStyle(index)
    nodes/index.ts             nodeTypes 注册表（prompt → PromptNode / llm → LlmNode / image → ImageNode / video → SeedanceNode / asset → AssetNode / group → GroupNode）
  components/inspector/        右侧节点参数面板（Inspector）：节点卡片只显示结果，参数都在此编辑
    NodeInspector.tsx          仅在「恰好选中一个 image/video/llm 节点」时出现；按类型装配子面板 + 置底「请求」预览（buildXxxRequest 的实发请求体，JSON / 表格 两视图可切换、偏好存 localStorage）；宽度经 useResizableWidth 可调
    ImageInput.tsx             输入图**只读预览**（图像节点用）：上游连线图排前 + 旧数据手填 URL 排后，按发送顺序编号；无输入图时提示「拖图片到画布空白处建素材节点连线」（不再上传/手填 URL）
    ImageParams.tsx            图像节点参数控件：按模型分两套（Image 2 走 size/quality/n；Nano Banana 走 version/aspectRatio/imageSize）；旧尺寸回退到受支持默认
    VideoParams.tsx            视频节点（Seedance）参数控件：version + 分辨率/宽高比并排 + 时长滑块；输入图/音频改由连线决定（无上传/手填 UI）
    PodcastParams.tsx          播客节点参数：两个角色（角色名 + 火山音色 ID，从火山控制台音色库复制）+ 音频参数（采样率下拉 / 语速 / 音量 / 音调 / 句间停顿滑块）+ 文本处理开关（过滤括号内容——会连 [轻笑] 表演指令一起滤、过滤 Markdown、过滤 Emoji、朗读语种下拉）+ AIGC 水印（aigc_watermark 生成标识开关——逐句合成每句结尾都有；aigc_metadata meta 隐式水印开关 + 四个元信息小输入，开启时每句按 wav 请求）；语音指令（context_texts）UI 已隐藏、字段保留
    LlmParams.tsx              Any LLM 节点参数：Model **下拉**（候选 = 手动模型列表(设置里维护) ∪ 端点动态获取，经 mergeModelOptions 合并；挂载时自动拉 + 「刷新」按钮重取；已选值置顶保留；并集为空才回退手填输入框；每个选项后缀 <ModelCapabilityBadges> 能力图标）+ Temperature 滑块 + Thinking 开关
    components/model/ModelCapabilityBadges.tsx  模型能力小图标：读 modelCapabilities(name) 只渲染推断支持的能力（思考=Brain/图像=Eye/音频=AudioLines/视频=Video，各带中文 tooltip），供设置 Agent 模型名下拉与 Any LLM 节点 Model 下拉的选项共用（Radix SelectValue 会连带在 trigger 显示已选模型的图标）
apps/desktop/
  src/main.ts                  Electron 主进程：dataDir=userData → startServer(内嵌后端)；生产固定端口 42617（保证 localStorage origin 稳定，主题/homeView 偏好可跨启动保留；被占用才回退随机端口）+ 托管 SPA 后 loadURL(localhost)，开发连 VITE_DEV_SERVER_URL(5173)；窗口 backgroundColor 跟随 nativeTheme 明暗（防暗色用户启动白闪）；含 OPENFLOW_SELFTEST 无界面自检分支
  src/preload.ts               预加载：contextIsolation，仅暴露 window.openflow.desktop 标记（渲染进程只用 fetch 访问本地 /api）
  scripts/build.mjs            esbuild 把 main/preload + @openflow/server 打成 CJS(dist-electron/*.cjs，better-sqlite3/electron 外部化) + 拷 apps/web/dist → dist-electron/web
  scripts/sqlite-abi.mjs       在 Node/Electron ABI 间切 better-sqlite3（node=prebuild-install / electron=electron-rebuild / win=prebuild-install 拉 win32-x64+Electron ABI 预编译产物，供 mac 交叉打包 win）
  electron-builder.yml         打包配置：asar + better-sqlite3 解包(asarUnpack)；mac dmg/zip(arm64+x64,identity:null 未签名)、win nsis(x64 未签名)
```

## 技术约束

- **框架 / 构建**：React 19 + Vite + TypeScript（strict）；pnpm workspaces。
- **后端**：Hono + `@hono/node-server`，`tsx watch` 跑（免构建）；端口 8787。Vite dev 代理 `/api` → 8787（`apps/web/vite.config.ts`）。
- **数据库**：SQLite（`better-sqlite3`，单文件；开发在 `apps/server/data/openflow.db`，桌面端在 `userData` via env `OPENFLOW_DATA_DIR`）。`projects` 表 nodes/edges 存 JSON；`settings` 单行存 `default_req_from`(全局署名) + `aigc_endpoint`/`upload_endpoint`/`upload_media_endpoint`(可配置端点)；`tasks` 表存异步生成任务(状态/参数/结果 JSON)；`prompt_presets` 表存全局 Prompt 预设(title/content/category)。原生模块装不上时回退 Node 内置 `node:sqlite`。
- **数据流**：前端无 localStorage 持久化（仅 homeView / 主题偏好 + 迁移标记用 localStorage）。项目数据走 `/api/projects`；画布高频编辑防抖 PUT。全局 req_from 走 `/api/settings`。
- **画布 Agent**：`POST /api/agent/chat` 为**同步**接口（LLM 在请求内返回，前端 request 封装无超时、后端对上游 120s 超时）；LLM 端点/Key/模型 = **设置里 `agentEndpoint`/`agentApiKey`/`agentModel` 优先，为空回退 env `AGENT_ENDPOINT`/`AGENT_API_KEY`/`AGENT_MODEL`，均无则 400 提示去设置（无内置默认）**；`agentApiKey` 密钥**写入-only**（GET /api/settings 只回 hasAgentApiKey 标记，不回明文）；不要求 req_from（那是 AIGC 网关的署名约定，生图动作仍由既有 `/api/aigc` 链路强制校验）。Agent 建的节点/连线与手动创建完全同构：可手动改 Prompt 后点节点「生成」重跑（collectUpstreamPrompt 正常采集）。**模型选择动态化**：设置里的 Agent 模型名与 Any LLM 节点的 Model 均为下拉，候选 = **手动维护的模型列表**（`settings.agentModelList`，持久，在设置面板 textarea 每行一个）**∪ 端点 `GET /models` 动态获取**（经后端 `POST /api/agent/models` 代理注入密钥、绕 CORS，存 `useSettingsStore.agentModels` 会话态），经 `mergeModelOptions` 去重排序 + 已选值置顶。**支持 /models 的网关自动填充下拉、不支持的靠手动列表填充**，两种都得多选下拉；并集为空才回退手填。
- **生成调用**：图像 `/api/aigc`、视频 `/api/video` 现为**异步任务**——建任务行、立刻返回 `taskId`，AIGC 由 `task-store` 进程内 runner 后台跑（不阻塞响应）；前端把 `taskId` 存进节点 data（随项目防抖 PUT 落库），凭 `pollTask` 轮询 `/api/tasks/:id` 至终态。**关页面/刷新不丢结果**：重开后节点带 `taskId` 载入 → useEffect 重连轮询拿回结果；进程重启时残留 running 任务由 `reconcileInterruptedTasks()` 标 failed。文件上传 `/api/upload`（图片/音频按 `kind` 分流）仍是同步代理转发。以上均经后端绕 CORS；req_from 由后端从全局设置注入，**为空则直接返回 400 拒发、无兜底默认（`AIGC_REQ_FROM` 已不再使用）**。**端点地址优先取全局设置里的 `aigcEndpoint`/`uploadEndpoint`/`uploadMediaEndpoint`，为空才回退 env（`AIGC_ENDPOINT`/`UPLOAD_ENDPOINT`/`UPLOAD_MEDIA_ENDPOINT`）再回退内置默认**——便于打包分发后由用户自填，不写死内网 IP。
- **启动门槛**：`ReqFromGate` 在设置加载后若 req_from 为空则全屏阻断，必须填写署名才放行。
- **路由**：`react-router-dom` `HashRouter`。
- **画布**：React Flow（`@xyflow/react`），节点是普通 React 组件；连线 bezier 曲线（加粗；悬停高亮、选中节点相连的边高亮 + 蚂蚁线）。
- **UI**：shadcn/ui（Tailwind v4）。新增组件 `pnpm dlx shadcn@latest add <name>`（在 apps/web 内）。**深色模式**：class 策略（`.dark` 挂 `<html>`，Tailwind `@custom-variant dark`），组件一律用语义 token（bg-background/text-muted-foreground 等）自动适配，勿写死明色/暗色；主题偏好经 `useThemeStore` 存 localStorage，`index.html` 内联脚本首帧前挂类防白闪；`index.css` 末尾 `.dark { color-scheme: dark }` 让原生控件（滚动条 / `<audio>` / `<video>`）跟随。
- **路径别名**：`@/*` → `apps/web/src/*`。
- **共享类型**：跨前后端的纯数据契约放 `packages/shared`；后端不引 `@xyflow/react`，nodes/edges 当不透明 JSON。

## 桌面端打包（Electron，`apps/desktop`）

- **原理**：Electron 主进程直接内嵌 `@openflow/server` 的 `startServer()`（同一进程跑 Hono），生产环境让它顺带在根路径托管 `apps/web` 构建产物，窗口 `loadURL(http://localhost:<固定端口 42617，被占才回退随机>)`。→ 渲染进程 origin 即该 localhost，**现有前端相对 `/api` 调用零改动可用**；固定端口保证 localStorage origin 跨启动稳定（主题 / homeView 等 UI 偏好不丢）。数据库落 `app.getPath('userData')`（经 `OPENFLOW_DATA_DIR` 注入）。
- **构建链**：esbuild 把 `main.ts`/`preload.ts` + 内联的 `@openflow/server` 打成 CJS（`.cjs`，`electron` 与 `better-sqlite3` 外部化）；`apps/web` 仍用自身 Vite 构建，产物拷进 `dist-electron/web`。`@openflow/server` 在 desktop 里是 **devDependency**（打包时被 esbuild 内联，运行时不需要）；唯一真正的运行时原生依赖是 `better-sqlite3`。
- **⚠️ 原生模块 ABI 冲突（重要）**：`better-sqlite3` 是编译过的原生模块，Node 与 Electron 的 ABI 不同，而 pnpm 让二者共用同一物理副本，**一次只能是一种 ABI**。故：
  - `pnpm dev:all` / `pnpm server`（普通 Node）需 **Node ABI**；`electron .` 与打包需 **Electron ABI**。
  - `scripts/sqlite-abi.mjs` 负责切换：`rebuild:node`（prebuild-install）/ `rebuild:electron`（electron-rebuild）/ `rebuild:win`（prebuild-install 拉 win32-x64+Electron ABI 预编译产物）。
  - **⚠️ 交叉打包 win（在 mac 上）**：原生模块无法在 mac 上为 Windows 编译，electron-builder 对「异平台」目标**不会重建**（会把 node_modules 里当前那份 `.node` 原样拷进包）。故 `dist:win`/`dist:all` 的 win 步骤先 `rebuild:win` 把 win32-x64+Electron ABI 的 `better_sqlite3.node` 覆盖进 node_modules，再 `electron-builder --win -c.npmRebuild=false` 原样打包——**否则包里会混进 mac 的 `.node`，Windows 上加载即崩、内嵌服务起不来、窗口不出现（进程在但无界面）**。彻底可靠的方式仍是在 Windows/CI 上原生构建。
  - `dist:mac`/`dist:win` **打包结束会自动 `rebuild:node` 还原**（打好的 app 已自带对应 ABI 副本），故打包不破坏 `pnpm dev:all`；`pnpm --filter @openflow/desktop dev/start` 会先切 Electron ABI，用完想跑普通 Node 服务需手动 `pnpm --filter @openflow/desktop rebuild:node`。
- **分发**：当前 mac(arm64 + x64/Intel dmg/zip，各自内置对应 arch 原生模块) / win(x64 nsis) 均 **未签名**（内部自用）；mac 首次打开需右键「打开」绕过 Gatekeeper，win 点「仍要运行」绕过 SmartScreen。产物在 `apps/desktop/release/`（gitignore；x64 dmg 无 arch 后缀 `OpenFlow-<ver>.dmg`，arm64 为 `-arm64.dmg`）。正式对外分发需另配 Apple Developer ID 公证 + Windows 代码签名证书。
- **端点分发友好**：内网 AIGC/上传地址不写死，改由设置面板填（存后端 settings）；打包发给不同网络的人也能自行改地址。
- **pnpm 注意**：`@electron/rebuild` 用 git 引用 `@electron/node-gyp`，`pnpm-workspace.yaml` 里用 `overrides` 覆盖成 npm 发布版绕开 exotic-subdep 拦截；`electron` 的 postinstall 需在 `allowBuilds` 放行。

## 编码规范

- 组件文件 PascalCase，函数组件具名导出。
- 新增节点类型需同步更新 `apps/web/src/lib/types.ts`、`nodes/index.ts`、`createNode()`(store)、`lib/nodeMenu.ts` 的 `NODE_GROUPS`（侧栏拖拽建节点 + 画布右键菜单点选建节点共用）；图像/视频类的预置模型在 `lib/nodeCatalog.ts`。（例外：`asset` 素材节点不走侧栏/`createNode`，由 `FlowCanvas` 拖拽经 `addAssetNode()` 创建；`group` 分组容器也不走侧栏/`createNode`，由 `groupSelectedNodes()` action 按选中节点包围盒创建，故未加入 `FlowNodeType`/`NODE_GROUPS`。）
- 节点内可交互元素加 `nodrag` class。
- 不手改 `apps/web/src/components/ui/*`、`src/hooks/use-mobile.ts` 与 `index.css` 的 shadcn 主题块（生成内容，已在 eslint globalIgnores 排除）。
- 改后端 SQLite 表结构时注意已有数据兼容。
- 提交前确保根 `pnpm -r lint`、`pnpm -r typecheck`、`pnpm -r build` 通过。

## 后续可扩展（当前未做）
- 多用户 + 鉴权；流式输出（SSE）。
- 按连线拓扑顺序自动编排执行（把上游输出喂给下游）。
- 导入 / 导出工作流 JSON、撤销重做、更多节点类型。
