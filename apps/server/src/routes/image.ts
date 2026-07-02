import { Hono } from 'hono'
import type { GenImageBody } from '@openflow/shared'
import { readSettings } from '../settings-store'
import { createTask, startTask } from '../task-store'

export const image = new Hono()

// 建图像生成任务：校验后建任务行、后台跑 AIGC，立刻返回 taskId（前端凭它轮询/刷新重连）。
image.post('/aigc', async (c) => {
  const body = await c.req.json<GenImageBody>().catch(() => null)
  if (!body?.model || !body.prompt?.trim()) {
    return c.json({ error: '缺少 model 或 prompt' }, 400)
  }
  if (!body.projectId || !body.nodeId) {
    return c.json({ error: '缺少 projectId 或 nodeId' }, 400)
  }
  // req_from 空 → 同步早失败（比让任务静默失败更友好）
  const s = readSettings()
  if (!s.defaultReqFrom.trim()) {
    return c.json({ error: '缺少调用方署名 req_from，请先在设置中填写' }, 400)
  }
  const task = createTask({
    projectId: body.projectId,
    nodeId: body.nodeId,
    kind: 'image',
    params: body,
  })
  startTask(task)
  return c.json({ taskId: task.id }, 201)
})
