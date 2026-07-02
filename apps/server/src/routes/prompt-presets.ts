import { Hono } from 'hono'
import type { SavePromptPresetBody } from '@openflow/shared'
import { createPreset, deletePreset, listPresets, updatePreset } from '../preset-store'

export const promptPresets = new Hono()

/** 校验请求体：title/content 均为字符串，title trim 后非空（content 允许空）。 */
function parseBody(raw: unknown): SavePromptPresetBody | null {
  if (!raw || typeof raw !== 'object') return null
  const { title, content } = raw as Record<string, unknown>
  if (typeof title !== 'string' || typeof content !== 'string') return null
  if (!title.trim()) return null
  return { title: title.trim(), content }
}

// 列表
promptPresets.get('/', (c) => c.json(listPresets()))

// 新建
promptPresets.post('/', async (c) => {
  const body = parseBody(await c.req.json().catch(() => null))
  if (!body) return c.json({ error: '缺少标题或内容' }, 400)
  return c.json(createPreset(body), 201)
})

// 更新
promptPresets.put('/:id', async (c) => {
  const body = parseBody(await c.req.json().catch(() => null))
  if (!body) return c.json({ error: '缺少标题或内容' }, 400)
  const updated = updatePreset(c.req.param('id'), body)
  if (!updated) return c.json({ error: '预设不存在' }, 404)
  return c.json(updated)
})

// 删除
promptPresets.delete('/:id', (c) => {
  deletePreset(c.req.param('id'))
  return c.json({ ok: true })
})
