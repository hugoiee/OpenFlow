import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
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
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_MODE_DEFAULT,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_VERSION_DEFAULT,
} from '@/lib/nodeCatalog'
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
  addNode: (type: FlowNodeType, model?: string) => void
  updateNodeData: (nodeId: string, data: Partial<FlowNode['data']>) => void
}

function createNode(type: FlowNodeType, count: number, model = ''): FlowNode {
  // 让新节点错落排布，避免完全重叠
  const position = { x: 80 + (count % 4) * 60, y: 80 + count * 50 }
  if (type === 'prompt') {
    return {
      id: newId('n_'),
      type: 'prompt',
      position,
      data: { label: 'Prompt', text: '' },
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
  // 视频生成节点（seedance）：带具名模型 + 可调选项默认值；运行状态/结果初始为空
  return {
    id: newId('n_'),
    type: 'video',
    position,
    data: {
      label: '视频',
      model,
      imagesText: '',
      version: SEEDANCE_VERSION_DEFAULT,
      mode: SEEDANCE_MODE_DEFAULT,
      resolution: SEEDANCE_RESOLUTION_DEFAULT,
      duration: SEEDANCE_DURATION_DEFAULT,
      running: false,
      result: [],
    },
  }
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

export const useFlowStore = create<FlowState>()((set) => {
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
        // image/video 节点的 running/error 是瞬时态：运行中刷新会被防抖 PUT 存成 running:true，
        // 载入时复位，避免节点永远卡在「生成中…」（result 保留，刷新后仍能看到上次结果）。
        nodes: (d.nodes as FlowNode[]).map((node) => {
          if (node.type === 'image') {
            return { ...node, data: { ...node.data, running: false, error: undefined } }
          }
          if (node.type === 'video') {
            return { ...node, data: { ...node.data, running: false, error: undefined } }
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
      patchActive((p) => ({ ...p, nodes: applyNodeChanges(changes, p.nodes) })),

    onEdgesChange: (changes) =>
      patchActive((p) => ({ ...p, edges: applyEdgeChanges(changes, p.edges) })),

    onConnect: (connection) =>
      patchActive((p) => ({ ...p, edges: addEdge(connection, p.edges) })),

    addNode: (type, model) =>
      patchActive((p) => ({
        ...p,
        nodes: [...p.nodes, createNode(type, p.nodes.length, model)],
      })),

    updateNodeData: (nodeId, data) =>
      patchActive((p) => ({
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as FlowNode) : n,
        ),
      })),
  }
})

/** 选择当前激活的项目（没有则为 undefined）。 */
export function useActiveProject(): Project | undefined {
  return useFlowStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
}
