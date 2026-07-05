import { Hono } from 'hono'
import type { GenLlmBody } from '@openflow/shared'
import { createTask, startTask } from '../task-store'

export const llm = new Hono()

// 建 Any LLM 文本生成任务：校验后建任务行、后台跑补全，立刻返回 taskId（前端凭它轮询/刷新重连）。
// 复用画布 Agent 的 endpoint/key（不需 req_from）；未配置时由后台任务给出可读失败，节点内联展示。
llm.post('/llm', async (c) => {
  const body = await c.req.json<GenLlmBody>().catch(() => null)
  if (!body?.model || !body.prompt?.trim()) {
    return c.json({ error: '缺少 model 或 prompt' }, 400)
  }
  if (!body.projectId || !body.nodeId) {
    return c.json({ error: '缺少 projectId 或 nodeId' }, 400)
  }
  const task = createTask({
    projectId: body.projectId,
    nodeId: body.nodeId,
    kind: 'llm',
    params: body,
  })
  startTask(task)
  return c.json({ taskId: task.id }, 201)
})
