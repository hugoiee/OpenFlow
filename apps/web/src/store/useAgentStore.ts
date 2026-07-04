import { create } from 'zustand'
import type { AgentMessage } from '@openflow/shared'
import { agentChatApi } from '@/lib/api'
import { executeAgentActions } from '@/lib/agentExecutor'
import { newId } from '@/lib/id'

/** 聊天面板里的一条消息（比 AgentMessage 多前端展示态）。 */
export type AgentChatItem = {
  id: string
  role: 'user' | 'assistant'
  content: string
  /**
   * 进 LLM 历史的完整内容（有动作的 assistant 轮 = 模型原始 JSON 计划，含各 prompt 全文）；
   * 缺省用 content。这样「再来一张一样的，但…」等追问能拿到上一轮写的提示词细节。
   */
  llmContent?: string
  /** assistant 消息：本轮已成功落到画布并开始生成的动作数（无动作时为 undefined）。 */
  okCount?: number
  /** assistant 消息：动作执行失败的可读信息（若有）。 */
  actionErrors?: string[]
  /** 该条是请求失败的错误提示（红色样式，且不进 LLM 历史）。 */
  isError?: boolean
}

// 面板开合是纯 UI 偏好，同 homeView 一样存 localStorage
const PANEL_KEY = 'openflow-agent-panel'

type AgentState = {
  /** projectId → 会话消息。仅存内存：刷新即新会话（画布节点与结果不受影响）。 */
  conversations: Record<string, AgentChatItem[]>
  /** projectId → 是否正在等待 Agent 答复。 */
  sending: Record<string, boolean>
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  /** 发送一轮对话：调后端拿计划 → 执行画布动作 → 把答复与执行结果追加进会话。 */
  send: (projectId: string, text: string) => Promise<void>
}

export const useAgentStore = create<AgentState>()((set, get) => {
  const push = (projectId: string, item: AgentChatItem) =>
    set((s) => ({
      conversations: {
        ...s.conversations,
        [projectId]: [...(s.conversations[projectId] ?? []), item],
      },
    }))

  return {
    conversations: {},
    sending: {},
    panelOpen: localStorage.getItem(PANEL_KEY) !== '0',

    setPanelOpen: (open) => {
      localStorage.setItem(PANEL_KEY, open ? '1' : '0')
      set({ panelOpen: open })
    },

    send: async (projectId, text) => {
      const content = text.trim()
      if (!content || get().sending[projectId]) return
      push(projectId, { id: newId('m_'), role: 'user', content })
      set((s) => ({ sending: { ...s.sending, [projectId]: true } }))
      try {
        // 历史含刚追加的这条用户消息；错误提示条不进 LLM 上下文。
        // 过滤后可能出现连续同角色消息（上一轮失败只剩 user），合并之——严格网关要求角色交替。
        const history: AgentMessage[] = (get().conversations[projectId] ?? [])
          .filter((m) => !m.isError)
          .map((m) => ({ role: m.role, content: m.llmContent ?? m.content }))
          .reduce<AgentMessage[]>((acc, m) => {
            const last = acc[acc.length - 1]
            if (last && last.role === m.role) last.content += `\n\n${m.content}`
            else acc.push({ ...m })
            return acc
          }, [])
        const { reply, actions } = await agentChatApi({ projectId, messages: history })
        const executed = await executeAgentActions(projectId, actions)
        const okCount = executed.filter((r) => r.ok).length
        const actionErrors = executed
          .filter((r) => !r.ok && r.error)
          .map((r) => (r.title ? `${r.title}：${r.error}` : r.error!))
        push(projectId, {
          id: newId('m_'),
          role: 'assistant',
          content: reply,
          // 有动作时把整个计划（含 prompt 全文）回灌 LLM 历史，供后续「照着上一张改」类追问
          llmContent:
            actions.length > 0 ? JSON.stringify({ reply, actions }) : undefined,
          okCount: actions.length > 0 ? okCount : undefined,
          actionErrors: actionErrors.length > 0 ? actionErrors : undefined,
        })
      } catch (e) {
        push(projectId, {
          id: newId('m_'),
          role: 'assistant',
          isError: true,
          content: e instanceof Error ? e.message : String(e),
        })
      } finally {
        set((s) => ({ sending: { ...s.sending, [projectId]: false } }))
      }
    },
  }
})
