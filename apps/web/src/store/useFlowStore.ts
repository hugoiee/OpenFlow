import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import {
  createProjectApi,
  deleteProjectApi,
  listProjects,
  updateProjectApi,
} from '@/lib/api'
import { newId } from '@/lib/id'
import {
  NANO_ASPECT_DEFAULT,
  NANO_IMAGE_SIZE_DEFAULT,
  NANO_VERSION_DEFAULT,
  IMAGE_SIZE_DEFAULT,
  PODCAST_NODE_META,
  PODCAST_ROLE_A_DEFAULT,
  PODCAST_ROLE_B_DEFAULT,
  PODCAST_SPEECH_RATE_DEFAULT,
  STORYBOARD_NODE_META,
  VIDEO_VARIANT_DEFAULT,
  videoDefaultVersion,
  videoModelSpec,
  type VideoVariant,
} from '@/lib/nodeCatalog'
import { STORYBOARD_TEMPLATE_DEFAULT } from '@/lib/storyboardTemplate'
import {
  ARRANGE_GAP,
  GROUP_PADDING,
  computeBoundingBox,
  computeGridLayout,
  detachChildren,
  nodeSize,
} from '@/lib/layout'
import { RES_INPUT_HANDLE, normalizeResourceEdges, storyboardRoleImageHandleId } from '@/lib/graph'
import { isValidTypedConnection } from '@/lib/handleTypes'
import { collectMultiConnectEdges, collectSelectedResourceEdges } from '@/lib/multiConnect'
import { normalizeShotPrompt } from '@/lib/storyboard'
import {
  type FlowNode,
  type FlowNodeType,
  type Project,
  type StoryboardItem,
} from '@/lib/types'

/** 已下线的 Any LLM 节点类型名：只用于载入时识别并清掉旧数据（FlowNodeType 里已没有它）。 */
const LEGACY_LLM_TYPE = 'llm'

type HomeView = 'grid' | 'list'

// 首页宫格/列表偏好是纯 UI 偏好，仍存 localStorage（不进后端）
const HOME_VIEW_KEY = 'openflow-home-view'
function loadHomeView(): HomeView {
  return localStorage.getItem(HOME_VIEW_KEY) === 'list' ? 'list' : 'grid'
}

type FlowState = {
  projects: Project[]
  activeProjectId: string | null
  homeView: HomeView
  loaded: boolean
  /**
   * 「图结构版本号」：连线拓扑或任一节点的 data 可能变动时 +1；**纯视图态变更不动它**
   * （拖动=position、框选=select、RF 测量=dimensions）。
   *
   * 存在的理由：patchActive 每次写入都新建 project 对象，于是拖一下节点就让所有以 project
   * 作 useMemo 依赖的地方每帧失效——Inspector 的请求体构建要跑 O(E×N) 的上游采集（视频三遍）
   * 再 JSON.stringify 一次，而这些计算**根本不读 position**，算了也是同一个结果。
   * 以本版本号作依赖即可把这些每帧重算彻底消除。
   *
   * ⚠️ 前提约定（改 lib/requestBody.ts 与 lib/graph.ts 时务必守住）：
   * 请求体的构建只能依赖 edges 与各节点的 id/type/data，**不得读取 position/dimensions/selected**。
   * 一旦有人读了，拖动后的预览就会停留在旧值（刷新又对），极难排查。
   */
  graphRev: number

  // 数据加载
  loadProjects: () => Promise<void>

  // 项目管理
  addProject: (name?: string) => Promise<string>
  renameProject: (id: string, name: string) => void
  /** 置顶 / 取消置顶：首页把置顶项目单独成区排在最前（状态持久化到后端）。 */
  setProjectPinned: (id: string, pinned: boolean) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string) => void
  setHomeView: (view: HomeView) => void

  // 画布操作（作用于当前项目）
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  /** 拖动连线端点重连到新的 handle（Delete Edge on Drop：拖到空白处则由 FlowCanvas 删除该边）。 */
  onReconnect: (oldEdge: Edge, newConnection: Connection) => void
  addNode: (
    type: FlowNodeType,
    model?: string,
    position?: { x: number; y: number },
    videoVariant?: VideoVariant,
  ) => void
  /** 在指定画布坐标新建一个素材节点（上传中态），返回新节点 id。 */
  addAssetNode: (kind: 'image' | 'audio' | 'video', position: { x: number; y: number }) => string
  /** 删除某个节点（如素材上传失败时移除占位节点）。 */
  removeNode: (nodeId: string) => void
  /**
   * 复制某个节点：在原节点正右侧（让开整宽 + 间距，不重叠）生成一个内容相同的副本。
   * 保留全部参数配置与结果快照（result / 素材 url），但清掉 taskId 与运行态
   * （副本不再重连轮询，避免与原节点共用 taskId 串写）。group 容器不支持（原样返回）。
   * **输入连线一并复制**（同上游、同端点、同次序），输出连线不复制。
   */
  duplicateNode: (nodeId: string) => void
  updateNodeData: (nodeId: string, data: Partial<FlowNode['data']>) => void
  /** 同 updateNodeData，但显式指定项目：供异步回调（如 Agent 建任务后写 taskId）使用，不受「当前激活项目」切换影响。 */
  updateNodeDataInProject: (
    projectId: string,
    nodeId: string,
    data: Partial<FlowNode['data']>,
  ) => void
  /** Agent：在现有内容下方新建一组「Prompt → 图像」节点并连线，返回两节点 id（无激活项目返回 null）。 */
  addAgentGeneration: (input: {
    prompt: string
    model: string
    title?: string
  }) => { promptNodeId: string; imageNodeId: string } | null
  /** 脚本分镜：整表重建逐行条目并设 running（点「生成」时用；显式 projectId 防切画布丢写）。 */
  setStoryboardItems: (
    projectId: string,
    nodeId: string,
    items: StoryboardItem[],
    running: boolean,
  ) => void
  /**
   * 脚本分镜：单行 patch。并发 worker 各自完成时回写，必须在 set 时刻读最新 items 改一格——
   * 组件里整表回写会让并发请求各持过期闭包互相覆盖（丢更新）。
   */
  patchStoryboardItem: (
    projectId: string,
    nodeId: string,
    index: number,
    patch: Partial<StoryboardItem>,
  ) => void
  /**
   * 脚本分镜「落成节点」：在现有内容下方为每个分镜建一组「Prompt（写入该行 prompt）→
   * Seedance 视频（reference 变体，不自动运行）」并连线；按行首说话人把分镜节点角色端点上
   * 已连的参考图素材连到视频节点 res（该角色未连图则跳过）。一次写入落全部节点与边。
   * 返回创建组数（无激活项目返回 0）。
   */
  addStoryboardShots: (input: {
    storyboardNodeId: string
    shots: { line: string; roleIndex: number; prompt: string }[]
    model?: string
  }) => number
  /**
   * 从某个节点的 handle 拉线松开在空白处后新建一个节点并与源节点连线。
   * from.handleType='source'（从输出端拉出）→ 新节点作下游 target（源→新）；
   * from.handleType='target'（从输入端拉出）→ 新节点作上游 source（新→源）。
   * from.handleId：拉线所在端点的 id（多端点节点用来连回精确端点，避免误连到默认端点）。
   * 空 id（默认端点）传 null。
   * 若新节点在该方向上没有对应 handle（如从输出端拉出却选了无输入口的 Prompt），只建节点不连线。
   */
  addConnectedNode: (input: {
    type: FlowNodeType
    model?: string
    position: { x: number; y: number }
    from: { nodeId: string; handleType: 'source' | 'target'; handleId?: string | null }
    videoVariant?: VideoVariant
  }) => void
  /**
   * 批量连线按钮：把当前选中的**全部资源节点**连到某个已存在节点的指定端点。
   * 顺序按节点创建序（= 没写 @ 时的实发列表序）；类型不符 / 已存在的连线静默跳过。
   */
  connectSelectedResourcesTo: (targetNodeId: string, targetHandle: string | null) => void
  /**
   * 批量连线按钮松手在空白处 → 在落点新建节点，并把当前选中的全部资源节点连到它的统一资源端点 res。
   * 新节点若不收资源（如 Prompt 节点）则只建节点不连线，同 addConnectedNode 的既有做法。
   */
  addNodeWithSelectedResources: (input: {
    type: FlowNodeType
    model?: string
    position: { x: number; y: number }
    videoVariant?: VideoVariant
  }) => void
  /** 把当前选中的（未分组的非容器）节点包进一个新建的 group 容器节点，选中容器；<2 个则不动。 */
  groupSelectedNodes: () => void
  /** 取消分组：释放该 group 容器的子节点（坐标转绝对、清 parentId）并移除容器。 */
  ungroupNode: (groupId: string) => void
  /** 整理：把当前选中的（未分组的非容器）节点排成等间距网格；<2 个则不动。 */
  arrangeSelectedNodes: () => void
}

function createNode(
  type: FlowNodeType,
  count: number,
  model = '',
  positionOverride?: { x: number; y: number },
  videoVariant?: VideoVariant,
): FlowNode {
  // 拖入时用指针落点；点按时让新节点错落排布，避免完全重叠
  const position = positionOverride ?? { x: 80 + (count % 4) * 60, y: 80 + count * 50 }
  if (type === 'prompt') {
    return {
      id: newId('n_'),
      type: 'prompt',
      position,
      data: { label: 'Prompt', text: '' },
    }
  }
  if (type === 'podcast') {
    // 播客音频节点（火山 TTS）：内置脚本 + 双角色音色；运行状态/结果初始为空。
    return {
      id: newId('n_'),
      type: 'podcast',
      position,
      data: {
        label: PODCAST_NODE_META.label,
        script: '',
        roleAName: PODCAST_ROLE_A_DEFAULT,
        roleAVoice: '',
        roleBName: PODCAST_ROLE_B_DEFAULT,
        roleBVoice: '',
        speechRate: PODCAST_SPEECH_RATE_DEFAULT,
        running: false,
        result: [],
      },
    }
  }
  if (type === 'storyboard') {
    // 脚本分镜节点：整篇脚本 + prompt 模板（内置默认模板开箱可用）+ 双角色名（同播客默认）。
    return {
      id: newId('n_'),
      type: 'storyboard',
      position,
      data: {
        label: STORYBOARD_NODE_META.label,
        script: '',
        template: STORYBOARD_TEMPLATE_DEFAULT,
        roleAName: PODCAST_ROLE_A_DEFAULT,
        roleBName: PODCAST_ROLE_B_DEFAULT,
        items: [],
        running: false,
      },
    }
  }
  if (type === 'image') {
    // 图像生成节点：带具名模型 + 可调选项默认值；运行状态/结果初始为空。
    // 统一带上 Image 2 与 Nano Banana 两套字段默认值，后端按 model 取舍。
    return {
      id: newId('n_'),
      type: 'image',
      position,
      data: {
        label: '图像',
        model,
        imagesText: '',
        size: IMAGE_SIZE_DEFAULT,
        n: 1,
        quality: 'auto',
        version: NANO_VERSION_DEFAULT,
        aspectRatio: NANO_ASPECT_DEFAULT,
        imageSize: NANO_IMAGE_SIZE_DEFAULT,
        running: false,
        result: [],
      },
    }
  }
  // 视频生成节点：变体（首尾帧/参考图）+ 具名模型 + 可调选项默认值；运行/结果初始为空。
  // 默认值取自该模型的能力表——三家的分辨率/比例/时长范围各不相同，写死一套会一建出来就越界。
  const version = videoDefaultVersion(model)
  const spec = videoModelSpec(model, version)
  return {
    id: newId('n_'),
    type: 'video',
    position,
    data: {
      label: '视频',
      model,
      videoVariant: videoVariant ?? VIDEO_VARIANT_DEFAULT,
      imageInputs: 1,
      audioInputs: 1,
      imagesText: '',
      version,
      resolution: spec.resolutionDefault,
      ratio: spec.ratioDefault,
      duration: spec.durationDefault,
      running: false,
      result: [],
    },
  }
}

// Agent 摆放新节点时估算已有节点的高度（React Flow 尚未测量到时的兜底），用于找画布底部空位
const AGENT_PLACE_FALLBACK_HEIGHT: Record<string, number> = {
  prompt: 190,
  image: 380,
  video: 400,
  podcast: 320,
  asset: 220,
  storyboard: 420,
}

// 画布高频编辑 → 防抖把激活项目整体 PUT 回后端
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function scheduleSave(project: Project) {
  clearTimeout(saveTimers[project.id])
  saveTimers[project.id] = setTimeout(() => {
    updateProjectApi(project.id, {
      name: project.name,
      nodes: project.nodes,
      edges: project.edges,
    }).catch((e) => console.error('[openflow] 保存项目失败', e))
  }, 500)
}

export const useFlowStore = create<FlowState>()((set, get) => {
  /**
   * 更新当前项目并安排防抖保存。
   * `viewOnly=true` 表示本次只改了纯视图态（位置/尺寸/选中），不必推进 graphRev——见 graphRev 的注释。
   * 默认 bump：patchActive 有十几个调用点，默认推进保证「漏标」只会让下游多算一次（退化成原来的行为），
   * 绝不会算漏而显示过期数据。目前只有 onNodesChange 的纯拖动/框选分支会声明 viewOnly。
   */
  const patchActive = (updater: (project: Project) => Project, viewOnly = false) =>
    set((state) => {
      if (!state.activeProjectId) return state
      const projects = state.projects.map((p) =>
        p.id === state.activeProjectId ? updater(p) : p,
      )
      const active = projects.find((p) => p.id === state.activeProjectId)
      if (active) scheduleSave(active)
      return viewOnly ? { projects } : { projects, graphRev: state.graphRev + 1 }
    })

  return {
    projects: [],
    activeProjectId: null,
    homeView: loadHomeView(),
    loaded: false,
    graphRev: 0,

    loadProjects: async () => {
      const dtos = await listProjects()
      const projects: Project[] = dtos.map((d) => {
        // Any LLM 节点已下线：旧项目里残留的 llm 节点及其连线在载入时一并丢弃
        // （下次防抖存盘即把库里的也清干净），免得画布上留下渲染不出来的空节点与悬空连线。
        const dropped = new Set(
          (d.nodes as FlowNode[]).filter((n) => (n.type as string) === LEGACY_LLM_TYPE).map((n) => n.id),
        )
        // image/video 节点的 running/error 是瞬时态：载入时复位为非运行态，避免卡在「生成中…」。
        // 但保留 taskId（与 result）：若任务仍在飞，节点 mount 时凭 taskId 重连轮询（关页面不丢结果）。
        const nodes = (d.nodes as FlowNode[])
          .filter((n) => !dropped.has(n.id))
          .map((rawNode) => {
          // 清洗坏尺寸：React Flow 可能把 width/height 持久化成 0（测量竞态）。0 会被当作
          // 显式尺寸套到节点外层容器 → 节点塌成 0 宽、整体不可见（如 Prompt 节点重开看不到）。
          // 剔除 ≤0 的 width/height/measured，让 RF 重新测量自适应（渲染出来后尺寸自愈为正值）。
          let node = rawNode
          const badW = typeof rawNode.width === 'number' && rawNode.width <= 0
          const badH = typeof rawNode.height === 'number' && rawNode.height <= 0
          if (badW || badH) {
            node = { ...rawNode }
            delete node.width
            delete node.height
            delete node.measured
          }
          if (node.type === 'image') {
            return { ...node, data: { ...node.data, running: false, error: undefined } }
          }
          if (node.type === 'video') {
            return { ...node, data: { ...node.data, running: false, error: undefined } }
          }
          if (node.type === 'podcast') {
            return { ...node, data: { ...node.data, running: false, error: undefined } }
          }
          // 分镜节点：running 与逐行 pending/running 是纯前端请求瞬时态，载入复位为 idle
          // （done 的 prompt 是持久成果、error 提示用户重试，均保留）
          if (node.type === 'storyboard') {
            return {
              ...node,
              data: {
                ...node.data,
                running: false,
                items: node.data.items?.map((it) =>
                  it.status === 'pending' || it.status === 'running'
                    ? { ...it, status: 'idle' as const }
                    : it,
                ),
              },
            }
          }
          // 素材节点：uploading 是瞬时态，载入时复位，避免刷新后卡在「上传中…」
          if (node.type === 'asset') {
            return { ...node, data: { ...node.data, uploading: false } }
          }
          return node
        })
        return {
          id: d.id,
          name: d.name,
          nodes,
          // 旧编号端点连线归并到统一资源端点 res（首尾帧 First/Last 保留；保持旧采集次序）
          edges: normalizeResourceEdges(
            nodes,
            (d.edges as Edge[]).filter((e) => !dropped.has(e.source) && !dropped.has(e.target)),
          ),
          pinned: d.pinned ?? false,
        }
      })
      set({ projects, loaded: true })
    },

    addProject: async (name) => {
      const dto = await createProjectApi(name?.trim() || '未命名项目')
      const project: Project = {
        id: dto.id,
        name: dto.name,
        nodes: dto.nodes as FlowNode[],
        edges: dto.edges as Edge[],
        pinned: dto.pinned ?? false,
      }
      set((state) => ({
        projects: [project, ...state.projects],
        activeProjectId: project.id,
      }))
      return project.id
    },

    renameProject: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
      }))
      updateProjectApi(id, { name: trimmed }).catch((e) =>
        console.error('[openflow] 重命名失败', e),
      )
    },

    setProjectPinned: (id, pinned) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, pinned } : p)),
      }))
      updateProjectApi(id, { pinned }).catch((e) =>
        console.error('[openflow] 置顶失败', e),
      )
    },

    deleteProject: (id) => {
      set((state) => {
        const projects = state.projects.filter((p) => p.id !== id)
        const activeProjectId =
          state.activeProjectId === id
            ? (projects[0]?.id ?? null)
            : state.activeProjectId
        return { projects, activeProjectId }
      })
      deleteProjectApi(id).catch((e) => console.error('[openflow] 删除失败', e))
    },

    setActiveProject: (id) => set({ activeProjectId: id }),

    setHomeView: (view) => {
      localStorage.setItem(HOME_VIEW_KEY, view)
      set({ homeView: view })
    },

    onNodesChange: (changes) => {
      // 拖动 / 框选 / RF 测量只产出 position·select·dimensions 三种纯视图态变更，
      // 且这三条恰恰是每帧都在发的最热路径——标成 viewOnly 让 graphRev 不动，
      // 下游那些「只认图结构」的重计算（Inspector 的请求体构建）整段跳过。
      const viewOnly = changes.every(
        (c) => c.type === 'position' || c.type === 'select' || c.type === 'dimensions',
      )
      patchActive((p) => {
        // 删除 group 容器前，先把它的子节点释放出来（相对坐标转绝对、清 parentId），
        // 否则子节点会残留一个指向已删容器的 parentId，渲染错位。
        const removedGroupIds = new Set(
          changes
            .filter(
              (c): c is { type: 'remove'; id: string } =>
                c.type === 'remove' &&
                p.nodes.some((n) => n.id === c.id && n.type === 'group'),
            )
            .map((c) => c.id),
        )
        const base = removedGroupIds.size ? detachChildren(p.nodes, removedGroupIds) : p.nodes
        return { ...p, nodes: applyNodeChanges(changes, base) }
      }, viewOnly)
    },

    onEdgesChange: (changes) =>
      patchActive((p) => ({ ...p, edges: applyEdgeChanges(changes, p.edges) })),

    onConnect: (connection) =>
      patchActive((p) => {
        const withSource = addEdge(connection, p.edges) // 起点这根线（含 RF 自带的重复检测）
        // 框选多个资源后从其中一个拖线 → 其余选中的合法资源节点一并连到同一端点
        const extra = collectMultiConnectEdges(p.nodes, p.edges, connection)
        if (extra.length === 0) return { ...p, edges: withSource }
        // 本次新增的边按节点创建序排列（addEdge 把起点边追加在末尾，不排的话
        // 「从哪个节点起拖」会决定它排第一，进而影响没写 @ 时的实发 image_list 顺序）
        const added = withSource.slice(p.edges.length)
        const order = new Map(p.nodes.map((n, i) => [n.id, i]))
        const sorted = [...added, ...extra].sort(
          (a, b) => (order.get(a.source) ?? 0) - (order.get(b.source) ?? 0),
        )
        return { ...p, edges: [...p.edges, ...sorted] }
      }),

    onReconnect: (oldEdge, newConnection) =>
      patchActive((p) => ({ ...p, edges: reconnectEdge(oldEdge, newConnection, p.edges) })),

    addNode: (type, model, position, videoVariant) =>
      patchActive((p) => ({
        ...p,
        nodes: [...p.nodes, createNode(type, p.nodes.length, model, position, videoVariant)],
      })),

    addAssetNode: (kind, position) => {
      const id = newId('n_')
      const node: FlowNode = {
        id,
        type: 'asset',
        position,
        data: {
          label: kind === 'image' ? '图像素材' : kind === 'video' ? '视频素材' : '音频素材',
          kind,
          url: '',
          uploading: true,
        },
      }
      patchActive((p) => ({ ...p, nodes: [...p.nodes, node] }))
      return id
    },

    removeNode: (nodeId) =>
      patchActive((p) => ({
        ...p,
        nodes: p.nodes.filter((n) => n.id !== nodeId),
        // 一并清掉与该节点相关的连线
        edges: p.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      })),

    duplicateNode: (nodeId) =>
      patchActive((p) => {
        const source = p.nodes.find((n) => n.id === nodeId)
        // group 容器不复制（需连子节点 + 子连线一起，暂不支持）；节点不存在也原样返回
        if (!source || source.type === 'group') return p
        const { w } = nodeSize(source)
        // 复制 data：清运行态与 taskId（副本不重连轮询，避免与原节点串写），
        // result 数组另建一份避免共享引用（结果作静态快照保留）。
        const data = { ...source.data } as Record<string, unknown>
        delete data.taskId
        delete data.error
        if ('running' in data) data.running = false
        if (Array.isArray(data.result)) data.result = [...data.result]
        const copy = {
          ...source,
          id: newId('n_'),
          // 正右侧、同一水平线：让开原节点整宽 + 间距 → 不重叠（原节点在组内则沿用相对坐标留在同组）
          position: { x: source.position.x + w + ARRANGE_GAP, y: source.position.y },
          selected: true,
          data: data as FlowNode['data'],
        } as FlowNode
        // 选中态转到副本：其余节点取消选中
        const nodes = p.nodes.map((n) => (n.selected ? { ...n, selected: false } : n))
        // 输入连线一并复制：副本接同样的上游、落同样的端点，复制出来即可直接跑，
        // 不必手动把 Prompt / 资源重连一遍。**只复制输入不复制输出**——副本若也喂给
        // 原来的下游，等于凭空给下游多塞一份输入，几乎从不是想要的。
        // 保持原数组相对次序：没写 @ 时实发列表按连线序，乱序会改变副本的出图结果。
        const copiedEdges: Edge[] = p.edges
          .filter((e) => e.target === nodeId)
          .map((e) => ({ ...e, id: newId('e_'), target: copy.id, selected: false }))
        return { ...p, nodes: [...nodes, copy], edges: [...p.edges, ...copiedEdges] }
      }),

    updateNodeData: (nodeId, data) =>
      patchActive((p) => ({
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as FlowNode) : n,
        ),
      })),

    updateNodeDataInProject: (projectId, nodeId, data) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                nodes: p.nodes.map((n) =>
                  n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as FlowNode) : n,
                ),
              }
            : p,
        )
        const target = projects.find((p) => p.id === projectId)
        if (target) scheduleSave(target)
        return { projects }
      }),

    addAgentGeneration: ({ prompt, model, title }) => {
      const { activeProjectId, projects } = get()
      const project = projects.find((p) => p.id === activeProjectId)
      if (!project) return null
      // 摆到现有内容下方，成对横排：Prompt 在左、图像节点在右（连续多组自然向下堆叠）
      const bottom = project.nodes.reduce((max, n) => {
        const height =
          n.measured?.height ?? AGENT_PLACE_FALLBACK_HEIGHT[n.type ?? 'prompt'] ?? 220
        return Math.max(max, n.position.y + height)
      }, 0)
      const y = project.nodes.length > 0 ? bottom + 60 : 80
      const cleanTitle = title?.trim()
      const promptNode: FlowNode = {
        id: newId('n_'),
        type: 'prompt',
        position: { x: 80, y },
        data: { label: cleanTitle || 'Prompt', text: prompt },
      }
      const imageNode = createNode('image', project.nodes.length, model, { x: 420, y })
      if (cleanTitle) imageNode.data.label = cleanTitle
      const edge: Edge = {
        id: newId('e_'),
        source: promptNode.id,
        target: imageNode.id,
        type: 'default',
      }
      patchActive((p) => ({
        ...p,
        nodes: [...p.nodes, promptNode, imageNode],
        edges: [...p.edges, edge],
      }))
      return { promptNodeId: promptNode.id, imageNodeId: imageNode.id }
    },

    setStoryboardItems: (projectId, nodeId, items, running) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                nodes: p.nodes.map((n) =>
                  n.id === nodeId && n.type === 'storyboard'
                    ? { ...n, data: { ...n.data, items, running } }
                    : n,
                ),
              }
            : p,
        )
        const target = projects.find((p) => p.id === projectId)
        if (target) scheduleSave(target)
        return { projects }
      }),

    patchStoryboardItem: (projectId, nodeId, index, patch) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                nodes: p.nodes.map((n) =>
                  n.id === nodeId && n.type === 'storyboard'
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          items: (n.data.items ?? []).map((it, i) =>
                            i === index ? { ...it, ...patch } : it,
                          ),
                        },
                      }
                    : n,
                ),
              }
            : p,
        )
        const target = projects.find((p) => p.id === projectId)
        if (target) scheduleSave(target)
        return { projects }
      }),

    addStoryboardShots: ({ storyboardNodeId, shots, model }) => {
      const { activeProjectId, projects } = get()
      const project = projects.find((p) => p.id === activeProjectId)
      if (!project || shots.length === 0) return 0
      const videoModel = model ?? 'Seedance'
      // 角色 → 已连参考图：从分镜节点的角色端点反查素材节点 id（未连图则该组只连 Prompt）
      const roleImageSource: (string | undefined)[] = [0, 1].map(
        (roleIndex) =>
          project.edges.find(
            (e) =>
              e.target === storyboardNodeId &&
              e.targetHandle === storyboardRoleImageHandleId(roleIndex),
          )?.source,
      )
      // 摆到现有内容下方，成对横排逐行向下（找底逻辑同 addAgentGeneration）
      const bottom = project.nodes.reduce((max, n) => {
        const height =
          n.measured?.height ?? AGENT_PLACE_FALLBACK_HEIGHT[n.type ?? 'prompt'] ?? 220
        return Math.max(max, n.position.y + height)
      }, 0)
      const y0 = project.nodes.length > 0 ? bottom + 60 : 80
      // 行高 = 视频节点兜底高 + 间距（Prompt 更矮不顶行），保证纵向不重叠
      const rowH = (AGENT_PLACE_FALLBACK_HEIGHT.video ?? 400) + 60
      const newNodes: FlowNode[] = []
      const newEdges: Edge[] = []
      shots.forEach((shot, i) => {
        const y = y0 + i * rowH
        // 标题带台词前缀便于在 40 组节点里辨认是哪一句
        const title = `分镜${i + 1} · ${shot.line.replaceAll('\n', ' ').slice(0, 12)}`
        const promptNode: FlowNode = {
          id: newId('n_'),
          type: 'prompt',
          position: { x: 80, y },
          // @ImageN/@AudioN 字面引用归一成画布实发占位符 <<<kind_N>>>
          data: { label: title, text: normalizeShotPrompt(shot.prompt) },
        }
        const videoNode = createNode(
          'video',
          project.nodes.length + newNodes.length,
          videoModel,
          { x: 420, y },
          'reference',
        )
        videoNode.data.label = title
        newNodes.push(promptNode, videoNode)
        // Prompt → 视频默认文本端点（空 handle）
        newEdges.push({
          id: newId('e_'),
          source: promptNode.id,
          target: videoNode.id,
          type: 'default',
        })
        // 说话人参考图 → 视频统一资源端点 res（每节点仅 1 图，prompt 里的 <<<image_1>>> 序号必对）
        const imageSource = roleImageSource[shot.roleIndex]
        if (imageSource) {
          newEdges.push({
            id: newId('e_'),
            source: imageSource,
            target: videoNode.id,
            targetHandle: RES_INPUT_HANDLE,
            type: 'default',
          })
        }
      })
      patchActive((p) => ({
        ...p,
        nodes: [...p.nodes, ...newNodes],
        edges: [...p.edges, ...newEdges],
      }))
      return shots.length
    },

    addConnectedNode: ({ type, model, position, from, videoVariant }) =>
      patchActive((p) => {
        const node = createNode(type, p.nodes.length, model, position, videoVariant)
        const fromNode = p.nodes.find((n) => n.id === from.nodeId)
        // asset（纯源，只出不进）无输入 handle，podcast（终端节点）无任何 handle，
        // storyboard 只有角色参考图专用端点（无默认口/无输出）；
        // 拉线选了这类节点时无处可连 → 只建节点不连线，避免生成一条挂空的坏边。
        const canBeTarget = type !== 'asset' && type !== 'podcast' && type !== 'storyboard'
        const canBeSource = type !== 'podcast' && type !== 'storyboard'
        let edge: Edge | null = null
        if (from.handleType === 'source') {
          // 从输出端拉出：源=既有节点，目标=新节点。先试默认输入口（文本），不匹配再试
          // 统一资源端点 res（从素材/生成结果拉出建图像/视频节点）；都不匹配则只建节点
          const defaultOk = canBeTarget && isValidTypedConnection(fromNode, node, undefined)
          const resOk = canBeTarget && !defaultOk && isValidTypedConnection(fromNode, node, RES_INPUT_HANDLE)
          if (defaultOk || resOk) {
            edge = {
              id: newId('e_'),
              source: from.nodeId,
              sourceHandle: from.handleId ?? undefined,
              target: node.id,
              targetHandle: resOk ? RES_INPUT_HANDLE : undefined,
              type: 'default',
            }
          }
        } else if (canBeSource && isValidTypedConnection(node, fromNode, from.handleId)) {
          // 从输入端拉出：源=新节点，目标=既有节点的该端点；类型不匹配（如从图像端点拉出却选 Prompt）则只建节点
          edge = {
            id: newId('e_'),
            source: node.id,
            target: from.nodeId,
            targetHandle: from.handleId ?? undefined,
            type: 'default',
          }
        }
        return {
          ...p,
          nodes: [...p.nodes, node],
          edges: edge ? [...p.edges, edge] : p.edges,
        }
      }),

    connectSelectedResourcesTo: (targetNodeId, targetHandle) =>
      patchActive((p) => {
        const added = collectSelectedResourceEdges(p.nodes, p.edges, targetNodeId, targetHandle)
        if (added.length === 0) return p
        return { ...p, edges: [...p.edges, ...added] }
      }),

    addNodeWithSelectedResources: ({ type, model, position, videoVariant }) =>
      patchActive((p) => {
        const node = createNode(type, p.nodes.length, model, position, videoVariant)
        const nodes = [...p.nodes, node]
        // 只有图像/视频节点有统一资源端点 res；其余类型 collectSelectedResourceEdges 会全判不合法 → 只建节点
        const added = collectSelectedResourceEdges(nodes, p.edges, node.id, RES_INPUT_HANDLE)
        return { ...p, nodes, edges: added.length ? [...p.edges, ...added] : p.edges }
      }),

    groupSelectedNodes: () =>
      patchActive((p) => {
        // 只分组「选中的、非容器、且尚未属于任何组」的节点（不做嵌套分组）
        const selected = p.nodes.filter(
          (n) => n.selected && n.type !== 'group' && !n.parentId,
        )
        if (selected.length < 2) return p
        const box = computeBoundingBox(selected)
        const groupPos = { x: box.x - GROUP_PADDING, y: box.y - GROUP_PADDING }
        const width = box.width + GROUP_PADDING * 2
        const height = box.height + GROUP_PADDING * 2
        const groupId = newId('g_')
        const groupNode: FlowNode = {
          id: groupId,
          type: 'group',
          position: groupPos,
          width,
          height,
          style: { width, height },
          selected: true,
          data: { label: '分组' },
        }
        const selIds = new Set(selected.map((n) => n.id))
        const updated = p.nodes.map((n) => {
          if (!selIds.has(n.id)) return n.selected ? { ...n, selected: false } : n
          // 子节点：坐标转为相对父容器，挂 parentId + extent，取消选中
          return {
            ...n,
            parentId: groupId,
            extent: 'parent',
            selected: false,
            position: { x: n.position.x - groupPos.x, y: n.position.y - groupPos.y },
          } as FlowNode
        })
        // 容器必须排在其子节点之前（React Flow 要求 parent 在 child 前）
        return { ...p, nodes: [groupNode, ...updated] }
      }),

    ungroupNode: (groupId) =>
      patchActive((p) => {
        if (!p.nodes.some((n) => n.id === groupId && n.type === 'group')) return p
        const detached = detachChildren(p.nodes, new Set([groupId]))
        return { ...p, nodes: detached.filter((n) => n.id !== groupId) }
      }),

    arrangeSelectedNodes: () =>
      patchActive((p) => {
        const selected = p.nodes.filter(
          (n) => n.selected && n.type !== 'group' && !n.parentId,
        )
        if (selected.length < 2) return p
        const posById = new Map(
          computeGridLayout(selected).map((l) => [l.id, l.position] as const),
        )
        return {
          ...p,
          nodes: p.nodes.map((n) =>
            posById.has(n.id) ? { ...n, position: posById.get(n.id)! } : n,
          ),
        }
      }),
  }
})

/** 选择当前激活的项目（没有则为 undefined）。 */
export function useActiveProject(): Project | undefined {
  return useFlowStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
}

/**
 * 图结构版本号：只在连线拓扑或节点 data 可能变动时递增，拖动 / 框选 / 测量不动它。
 * 拿它（而不是 project 引用）作 useMemo 依赖，可让「只认图结构」的重计算在拖动期间一次都不跑。
 * 使用前请先读 FlowState.graphRev 上的那段约定。
 */
export function useGraphRev(): number {
  return useFlowStore((s) => s.graphRev)
}
