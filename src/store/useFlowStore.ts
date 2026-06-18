import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { newId } from '@/lib/id'
import {
  MODEL_OPTIONS,
  type FlowNode,
  type FlowNodeType,
  type Project,
} from '@/lib/types'
import { useSettingsStore } from '@/store/useSettingsStore'

type HomeView = 'grid' | 'list'

type FlowState = {
  projects: Project[]
  activeProjectId: string | null
  homeView: HomeView

  // 项目管理
  addProject: (name?: string) => string
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string) => void
  setHomeView: (view: HomeView) => void

  // 画布操作（作用于当前项目）
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (type: FlowNodeType) => void
  updateNodeData: (nodeId: string, data: Partial<FlowNode['data']>) => void
}

function createProject(name: string): Project {
  return { id: newId('p_'), name, nodes: [], edges: [] }
}

function createNode(type: FlowNodeType, count: number): FlowNode {
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
  const defaultModel =
    useSettingsStore.getState().settings.defaultModel || MODEL_OPTIONS[0]
  return {
    id: newId('n_'),
    type: 'model',
    position,
    data: { label: 'Model', model: defaultModel, result: '', running: false },
  }
}

export const useFlowStore = create<FlowState>()(
  persist(
    (set) => {
      // 把一次更新限制在当前项目上的小工具
      const patchActive = (updater: (project: Project) => Project) =>
        set((state) => {
          if (!state.activeProjectId) return state
          return {
            projects: state.projects.map((p) =>
              p.id === state.activeProjectId ? updater(p) : p,
            ),
          }
        })

      return {
        projects: [],
        activeProjectId: null,
        homeView: 'grid',

        addProject: (name) => {
          const project = createProject(name?.trim() || '未命名项目')
          set((state) => ({
            projects: [...state.projects, project],
            activeProjectId: project.id,
          }))
          return project.id
        },

        renameProject: (id, name) =>
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === id ? { ...p, name: name.trim() || p.name } : p,
            ),
          })),

        deleteProject: (id) =>
          set((state) => {
            const projects = state.projects.filter((p) => p.id !== id)
            const activeProjectId =
              state.activeProjectId === id
                ? (projects[0]?.id ?? null)
                : state.activeProjectId
            return { projects, activeProjectId }
          }),

        setActiveProject: (id) => set({ activeProjectId: id }),

        setHomeView: (view) => set({ homeView: view }),

        onNodesChange: (changes) =>
          patchActive((p) => ({
            ...p,
            nodes: applyNodeChanges(changes, p.nodes),
          })),

        onEdgesChange: (changes) =>
          patchActive((p) => ({
            ...p,
            edges: applyEdgeChanges(changes, p.edges),
          })),

        onConnect: (connection) =>
          patchActive((p) => ({
            ...p,
            edges: addEdge(connection, p.edges),
          })),

        addNode: (type) =>
          patchActive((p) => ({
            ...p,
            nodes: [...p.nodes, createNode(type, p.nodes.length)],
          })),

        updateNodeData: (nodeId, data) =>
          patchActive((p) => ({
            ...p,
            nodes: p.nodes.map((n) =>
              n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as FlowNode) : n,
            ),
          })),
      }
    },
    {
      name: 'openflow-store',
      // 只持久化数据，不持久化 action
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        homeView: state.homeView,
      }),
    },
  ),
)

/** 选择当前激活的项目（没有则为 undefined）。 */
export function useActiveProject(): Project | undefined {
  return useFlowStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
}

// 持久化数据里 model 节点的 running 可能停留在 true（上次运行中刷新），启动时清掉。
useFlowStore.setState((state) => ({
  projects: state.projects.map((p) => ({
    ...p,
    nodes: p.nodes.map((n) =>
      n.type === 'model' ? { ...n, data: { ...n.data, running: false } } : n,
    ),
  })),
}))
