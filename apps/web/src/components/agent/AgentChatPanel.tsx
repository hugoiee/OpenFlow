import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useResizableWidth } from '@/hooks/useResizableWidth'
import { useAgentStore, type AgentChatItem } from '@/store/useAgentStore'
import { useFlowStore } from '@/store/useFlowStore'

const EMPTY_MESSAGES: AgentChatItem[] = []

/** 面板收起时的悬浮入口（画布右下角；NodeInspector 打开时左移让位，避免盖住其底部控件）。 */
export function AgentChatToggle() {
  const panelOpen = useAgentStore((s) => s.panelOpen)
  const setPanelOpen = useAgentStore((s) => s.setPanelOpen)
  // 与 NodeInspector 相同的出现条件：恰好选中一个 image/video/podcast 节点。
  // 窄订阅（selector 返回布尔）：画布高频编辑（打字/拖拽/resize）时该值不变则不重渲染。
  const inspectorOpen = useFlowStore((s) => {
    const project = s.projects.find((p) => p.id === s.activeProjectId)
    const selected = project?.nodes.filter((n) => n.selected) ?? []
    return (
      selected.length === 1 &&
      (selected[0].type === 'image' ||
        selected[0].type === 'video' ||
        selected[0].type === 'podcast')
    )
  })
  if (panelOpen) return null
  return (
    <Button
      size="icon"
      title="画布 Agent"
      onClick={() => setPanelOpen(true)}
      className={`absolute bottom-4 z-20 size-11 rounded-full shadow-lg ${
        inspectorOpen ? 'right-64' : 'right-4'
      }`}
    >
      <Bot className="size-5" />
    </Button>
  )
}

function MessageBubble({ item }: { item: AgentChatItem }) {
  if (item.role === 'user') {
    return (
      <div className="ml-8 self-end whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {item.content}
      </div>
    )
  }
  return (
    <div
      className={`mr-8 flex flex-col gap-1 self-start rounded-lg px-3 py-2 text-sm ${
        item.isError ? 'bg-destructive/10 text-destructive' : 'bg-muted'
      }`}
    >
      <p className="whitespace-pre-wrap break-words">{item.content}</p>
      {item.okCount !== undefined && (
        <p className="text-xs text-muted-foreground">
          已在画布创建 {item.okCount} 组节点并开始生成
        </p>
      )}
      {item.actionErrors?.map((err, i) => (
        <p key={i} className="text-xs text-destructive">
          {err}
        </p>
      ))}
    </div>
  )
}

/**
 * 画布 Agent 聊天面板：说想法 → Agent 写 Prompt、建节点连线并触发生图。
 * 会话按项目区分、仅存内存；生成结果落在画布节点上，不依赖会话存续。
 */
export function AgentChatPanel({ projectId }: { projectId: string }) {
  const panelOpen = useAgentStore((s) => s.panelOpen)
  const setPanelOpen = useAgentStore((s) => s.setPanelOpen)
  const messages = useAgentStore((s) => s.conversations[projectId] ?? EMPTY_MESSAGES)
  const sending = useAgentStore((s) => s.sending[projectId] ?? false)
  const send = useAgentStore((s) => s.send)

  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  // 面板宽度可调：当前设计宽度 240px 作为下限
  const { width, onPointerDownResize } = useResizableWidth('openflow-agent-width', 240)

  // 新消息 / 思考态变化时滚到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  if (!panelOpen) return null

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    void send(projectId, text)
  }

  return (
    <aside
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l bg-background"
    >
      {/* 左缘拖拽调宽 */}
      <div
        onPointerDown={onPointerDownResize}
        title="拖拽调整宽度"
        className="absolute left-0 top-0 z-30 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
      />
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Bot className="size-4" />
        <span className="text-sm font-medium">画布 Agent</span>
        <Button
          variant="ghost"
          size="icon"
          title="收起"
          onClick={() => setPanelOpen(false)}
          className="ml-auto size-7"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="mt-6 flex flex-col gap-2 px-2 text-center text-sm text-muted-foreground">
            <p>说出你的想法和想要的画面，我来写 Prompt、建节点并生图。</p>
            <p className="text-xs">例如：帮我画一只在雨夜霓虹街头的赛博朋克猫</p>
          </div>
        )}
        {messages.map((item) => (
          <MessageBubble key={item.id} item={item} />
        ))}
        {sending && (
          <div className="mr-8 flex items-center gap-2 self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            正在思考…
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter 发送、Shift+Enter 换行；输入法组词中的 Enter 不触发
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="描述你想要的画面…"
          className="field-sizing-fixed h-16 min-h-16 resize-none text-sm"
        />
        <Button
          size="icon"
          title="发送"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </aside>
  )
}
