import { Hono } from 'hono'
import type { AgentChatBody, AgentMessage } from '@openflow/shared'
import { runAgentChat } from '../agent'
import { readSettings } from '../settings-store'

export const agent = new Hono()

// Agent 对话：同步调 LLM 产出 { reply, actions } 计划；画布动作与生图任务由前端执行
// （生图仍走既有 POST /api/aigc 异步任务链路，此接口不建任务）。
agent.post('/agent/chat', async (c) => {
  const body = await c.req.json<AgentChatBody>().catch(() => null)
  const messages: AgentMessage[] = Array.isArray(body?.messages)
    ? body.messages
        .filter(
          (m): m is AgentMessage =>
            !!m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim().length > 0,
        )
        // 只带最近的历史给 LLM，防止长会话撑爆上下文
        .slice(-20)
    : []
  if (messages.length === 0) {
    return c.json({ error: '缺少对话内容' }, 400)
  }
  try {
    return c.json(await runAgentChat(messages, readSettings()))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // 配置缺失是用户可自行修复的 400；上游 LLM 调用失败回 502
    return c.json({ error: message }, message.includes('请在设置中填写') ? 400 : 502)
  }
})
