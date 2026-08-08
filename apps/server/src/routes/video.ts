import { Hono } from 'hono'
import type { GenVideoBody } from '@openflow/shared'
import { readSettings } from '../settings-store'
import { createTask, startTask } from '../task-store'

export const video = new Hono()

// 建视频生成任务（seedance / kling / MiniMax-H3）：校验后建任务行、后台跑 AIGC，立刻返回 taskId。
video.post('/video', async (c) => {
  const body = await c.req.json<GenVideoBody>().catch(() => null)
  if (!body?.model) {
    return c.json({ error: '缺少 model' }, 400)
  }
  // 可灵多镜头模式下画面描述在 multi_prompt 里，顶层 prompt 本就为空——此时改校验分镜非空
  const hasShots = Boolean(body.multiShot) && (body.shots ?? []).some((s) => s?.prompt?.trim())
  if (!body.prompt?.trim() && !hasShots) {
    return c.json({ error: '缺少 prompt' }, 400)
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
