import { Hono } from 'hono'
import { getLatestTaskForNode, getTask, refetchTask } from '../task-store'

export const tasks = new Hono()

// 手动重拉：去 AIGC 历史接口再找一次结果（上游没带回 URL 但生成其实成功时的自救入口）
tasks.post('/:id/refetch', async (c) => {
  const id = c.req.param('id')
  if (!getTask(id)) return c.json({ error: '任务不存在' }, 404)
  try {
    const task = await refetchTask(id)
    if (!task) return c.json({ error: '任务不存在' }, 404)
    return c.json(task)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})

// 轮询单个任务（前端凭 taskId 拉状态/结果）
tasks.get('/:id', (c) => {
  const task = getTask(c.req.param('id'))
  if (!task) return c.json({ error: '任务不存在' }, 404)
  return c.json(task)
})

// 按节点取最近一次任务（刷新后节点无 taskId 时的重连兜底）
tasks.get('/', (c) => {
  const projectId = c.req.query('projectId')
  const nodeId = c.req.query('nodeId')
  if (!projectId || !nodeId) {
    return c.json({ error: '缺少 projectId 或 nodeId' }, 400)
  }
  const task = getLatestTaskForNode(projectId, nodeId)
  if (!task) return c.json({ error: '无任务' }, 404)
  return c.json(task)
})
