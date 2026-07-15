import { Hono } from 'hono'
import type { GenPodcastBody } from '@openflow/shared'
import { readSettings } from '../settings-store'
import { createTask, startTask } from '../task-store'
import { resolveVolcTts } from '../volc-tts'

export const podcast = new Hono()

// 建播客音频生成任务：校验脚本/角色 + 火山 Key 同步早失败 → 建任务行、后台逐行 TTS 拼接，
// 立刻返回 taskId（前端凭它轮询/刷新重连，同图像/视频链路）。不需要 req_from。
podcast.post('/podcast', async (c) => {
  const body = await c.req.json<GenPodcastBody>().catch(() => null)
  if (!body?.script?.trim()) {
    return c.json({ error: '缺少对话脚本' }, 400)
  }
  if (!body.projectId || !body.nodeId) {
    return c.json({ error: '缺少 projectId 或 nodeId' }, 400)
  }
  const roles = Array.isArray(body.roles) ? body.roles : []
  if (
    roles.length !== 2 ||
    roles.some((r) => typeof r?.name !== 'string' || typeof r?.voiceId !== 'string') ||
    roles.some((r) => !r.name.trim() || !r.voiceId.trim())
  ) {
    return c.json({ error: '请配置两个角色（角色名 + 火山音色 ID 均不能为空）' }, 400)
  }
  // 火山 Key 缺失 → 同步早失败（比让任务静默失败更友好）
  try {
    resolveVolcTts(readSettings())
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
  const task = createTask({
    projectId: body.projectId,
    nodeId: body.nodeId,
    kind: 'podcast',
    params: body,
  })
  startTask(task)
  return c.json({ taskId: task.id }, 201)
})
