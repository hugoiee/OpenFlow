import { Hono } from 'hono'
import type {
  AgentChatBody,
  AgentExpandBody,
  AgentMessage,
  AgentModelsBody,
  AgentModelsResponse,
  AgentTestBody,
  AgentTestResponse,
} from '@openflow/shared'
import { listAgentModels, runAgentChat, runAgentConnectionTest, runAgentExpand } from '../agent'
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

// 脚本分镜逐行扩写：模板 {{line}} 替换为台词后单次调 Agent LLM，返回该行的视频 prompt 纯文本。
// 前端逐行并发调用本接口（每行一次请求，单行可重试）；不建任务、不落库。
agent.post('/agent/expand', async (c) => {
  const body = await c.req.json<AgentExpandBody>().catch(() => null)
  const template = typeof body?.template === 'string' ? body.template : ''
  const line = typeof body?.line === 'string' ? body.line.trim() : ''
  if (!template.trim() || !line) {
    return c.json({ error: '缺少模板或台词' }, 400)
  }
  try {
    return c.json(await runAgentExpand({ template, line }, readSettings()))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // 配置缺失是用户可自行修复的 400；上游 LLM 调用失败回 502
    return c.json({ error: message }, message.includes('请在设置中填写') ? 400 : 502)
  }
})

// 最小用量连接测试：用请求体（或已存）的 Agent 配置发一条最小探测请求验证连通。
// 入参各字段可省略——省略/空则回退已存设置（apiKey 空 = 测已保存的密钥）；
// apiStyle 也要透传，否则设置面板「切了协议还没保存就点测试」测的是旧协议。
agent.post('/agent/test', async (c) => {
  const body = await c.req.json<AgentTestBody>().catch(() => ({}) as AgentTestBody)
  try {
    const result = await runAgentConnectionTest(
      {
        endpoint: body?.endpoint,
        apiKey: body?.apiKey,
        model: body?.model,
        apiStyle: body?.apiStyle,
      },
      readSettings(),
    )
    return c.json({ ok: true, ...result } satisfies AgentTestResponse)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // 配置缺失可自行修复回 400；上游调用失败回 502
    return c.json({ error: message }, message.includes('请在设置中填写') ? 400 : 502)
  }
})

// 动态获取模型列表：调端点 GET /models 列出可用模型 ID，供前端把「手填模型名」换成下拉。
// 入参 endpoint/apiKey 可省略——省略/空则回退已存设置（apiKey 空 = 用已保存的密钥）。
agent.post('/agent/models', async (c) => {
  const body = await c.req.json<AgentModelsBody>().catch(() => ({}) as AgentModelsBody)
  try {
    const models = await listAgentModels(
      { endpoint: body?.endpoint, apiKey: body?.apiKey },
      readSettings(),
    )
    return c.json({ models } satisfies AgentModelsResponse)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // 配置缺失可自行修复回 400；上游调用 / 端点不支持回 502
    return c.json({ error: message }, message.includes('请在设置中填写') ? 400 : 502)
  }
})
