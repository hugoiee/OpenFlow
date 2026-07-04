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
  LLM_MODEL_DEFAULT,
  LLM_TEMPERATURE_DEFAULT,
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_RATIO_DEFAULT,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_VERSION_DEFAULT,
  VIDEO_VARIANT_DEFAULT,
  type VideoVariant,
} from '@/lib/nodeCatalog'
import {
  GROUP_PADDING,
  computeBoundingBox,
  computeGridLayout,
  detachChildren,
} from '@/lib/layout'
import { isValidTypedConnection } from '@/lib/handleTypes'
import { type FlowNode, type FlowNodeType, type Project } from '@/lib/types'

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

  // 数据加载
  loadProjects: () => Promise<void>

  // 项目管理
  addProject: (name?: string) => Promise<string>
  renameProject: (id: string, name: string) => void
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
  addAssetNode: (kind: 'image' | 'audio', position: { x: number; y: number }) => string
  /** 删除某个节点（如素材上传失败时移除占位节点）。 */
  removeNode: (nodeId: string) => void
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
  /**
   * 从某个节点的 handle 拉线松开在空白处后新建一个节点并与源节点连线。
   * from.handleType='source'（从输出端拉出）→ 新节点作下游 target（源→新）；
   * from.handleType='target'（从输入端拉出）→ 新节点作上游 source（新→源）。
   * from.handleId：拉线所在端点的 id（如 Any LLM 的 'system'）——连回精确端点，
   * 否则多端点节点（如 LLM 的 Prompt/System）会误连到默认端点。空 id（默认端点）传 null。
   * 若新节点在该方向上没有对应 handle（如从输出端拉出却选了无输入口的 Prompt），只建节点不连线。
   */
  addConnectedNode: (input: {
    type: FlowNodeType
    model?: string
    position: { x: number; y: number }
    from: { nodeId: string; handleType: 'source' | 'target'; handleId?: string | null }
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
  if (type === 'llm') {
    // Any LLM 节点：带模型/温度/思考默认值；运行状态/结果初始为空。
    return {
      id: newId('n_'),
      type: 'llm',
      position,
      data: {
        label: 'Any LLM',
        model: model || LLM_MODEL_DEFAULT,
        temperature: LLM_TEMPERATURE_DEFAULT,
        thinking: false,
        running: false,
        result: '',
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
  // 视频生成节点（seedance）：变体（首尾帧/参考图）+ 具名模型 + 可调选项默认值；运行/结果初始为空
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
      version: SEEDANCE_VERSION_DEFAULT,
      resolution: SEEDANCE_RESOLUTION_DEFAULT,
      ratio: SEEDANCE_RATIO_DEFAULT,
      duration: SEEDANCE_DURATION_DEFAULT,
      running: false,
      result: [],
    },
  }
}

// Agent 摆放新节点时估算已有节点的高度（React Flow 尚未测量到时的兜底），用于找画布底部空位
const AGENT_PLACE_FALLBACK_HEIGHT: Record<string, number> = {
  prompt: 190,
  llm: 280,
  image: 380,
  video: 400,
  asset: 220,
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
  // 更新当前项目并安排防抖保存
  const patchActive = (updater: (project: Project) => Project) =>
    set((state) => {
      if (!state.activeProjectId) return state
      const projects = state.projects.map((p) =>
        p.id === state.activeProjectId ? updater(p) : p,
      )
      const active = projects.find((p) => p.id === state.activeProjectId)
      if (active) scheduleSave(active)
      return { projects }
    })

  return {
    projects: [],
    activeProjectId: null,
    homeView: loadHomeView(),
    loaded: false,

    loadProjects: async () => {
      const dtos = await listProjects()
      const projects: Project[] = dtos.map((d) => ({
        id: d.id,
        name: d.name,
        // image/video 节点的 running/error 是瞬时态：载入时复位为非运行态，避免卡在「生成中…」。
        // 但保留 taskId（与 result）：若任务仍在飞，节点 mount 时凭 taskId 重连轮询（关页面不丢结果）。
        nodes: (d.nodes as FlowNode[]).map((rawNode) => {
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
          if (node.type === 'llm') {
            return { ...node, data: { ...node.data, running: false, error: undefined } }
          }
          // 素材节点：uploading 是瞬时态，载入时复位，避免刷新后卡在「上传中…」
          if (node.type === 'asset') {
            return { ...node, data: { ...node.data, uploading: false } }
          }
          return node
        }),
        edges: d.edges as Edge[],
      }))
      set({ projects, loaded: true })
    },

    addProject: async (name) => {
      const dto = await createProjectApi(name?.trim() || '未命名项目')
      const project: Project = {
        id: dto.id,
        name: dto.name,
        nodes: dto.nodes as FlowNode[],
        edges: dto.edges as Edge[],
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

    onNodesChange: (changes) =>
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
      }),

    onEdgesChange: (changes) =>
      patchActive((p) => ({ ...p, edges: applyEdgeChanges(changes, p.edges) })),

    onConnect: (connection) =>
      patchActive((p) => ({ ...p, edges: addEdge(connection, p.edges) })),

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
          label: kind === 'image' ? '图像素材' : '音频素材',
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

    addConnectedNode: ({ type, model, position, from, videoVariant }) =>
      patchActive((p) => {
        const node = createNode(type, p.nodes.length, model, position, videoVariant)
        const fromNode = p.nodes.find((n) => n.id === from.nodeId)
        // 除 asset（纯源，只出不进）外都有输入(target) handle；从输出端拉出却选了无输入口的节点（asset）时，
        // 无处可连 → 只建节点不连线，避免生成一条挂空的坏边。
        const canBeTarget = type !== 'asset'
        let edge: Edge | null = null
        if (from.handleType === 'source') {
          // 从输出端拉出：源=既有节点，目标=新节点默认输入口；类型不匹配（如图像→新 LLM 的 Prompt 口）则只建节点
          if (canBeTarget && isValidTypedConnection(fromNode, node, undefined)) {
            edge = {
              id: newId('e_'),
              source: from.nodeId,
              sourceHandle: from.handleId ?? undefined,
              target: node.id,
              type: 'default',
            }
          }
        } else if (isValidTypedConnection(node, fromNode, from.handleId)) {
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
