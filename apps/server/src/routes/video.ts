import { Hono } from 'hono'
import type { GenVideoBody } from '@openflow/shared'
import { readSettings } from '../settings-store'
import { createTask, startTask } from '../task-store'

export const video = new Hono()

// 建视频生成任务（seedance）：校验后建任务行、后台跑 AIGC，立刻返回 taskId。
video.post('/video', async (c) => {
  const body = await c.req.json<GenVideoBody>().catch(() => null)
  if (!body?.model || !body.prompt?.trim()) {
    return c.json({ error: '缺少 model 或 prompt' }, 400)
  }
  if (!body.projectId || !body.nodeId) {
    return c.json({ error: '缺少 projectId 或 nodeId' }, 400)
  }
  const s = readSettings()
  if (!s.defaultReqFrom.trim()) {
    return c.json({ error: '缺少调用方署名 req_from，请先在设置中填写' }, 400)
  }
  const task = createTask({
    projectId: body.projectId,
    nodeId: body.nodeId,
    kind: 'video',
    params: body,
  })
  startTask(task)
  return c.json({ taskId: task.id }, 201)
})
