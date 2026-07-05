import { Hono } from 'hono'
import type { AgentChatBody, AgentMessage, AgentTestBody, AgentTestResponse } from '@openflow/shared'
import { runAgentChat, runAgentConnectionTest } from '../agent'
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

// 最小用量连接测试：用请求体（或已存）的 Agent 配置发一条 max_tokens:1 的探测请求验证连通。
// 入参各字段可省略——省略/空则回退已存设置（apiKey 空 = 测已保存的密钥）。
agent.post('/agent/test', async (c) => {
  const body = await c.req.json<AgentTestBody>().catch(() => ({}) as AgentTestBody)
  try {
    const result = await runAgentConnectionTest(
      { endpoint: body?.endpoint, apiKey: body?.apiKey, model: body?.model },
      readSettings(),
    )
    return c.json({ ok: true, ...result } satisfies AgentTestResponse)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // 配置缺失可自行修复回 400；上游调用失败回 502
    return c.json({ error: message }, message.includes('请在设置中填写') ? 400 : 502)
  }
})
