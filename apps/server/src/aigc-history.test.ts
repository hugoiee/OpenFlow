import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  claimKeyOf,
  fingerprintFromPayload,
  matchHistoryItem,
  type HistoryItem,
} from './aigc-history'
import { readAigcResult } from './provider'
import fixture from './__fixtures__/task-history.sample.json' with { type: 'json' }

// 夹具是脱敏后的 /api/task-history 真实响应结构（三条：新成功 / 明确失败 / 同参旧成功）。
const items = fixture.items as HistoryItem[]
const [newSuccess, failed, oldSuccess] = items

/** 复原「我们发出的请求体」：与 buildVideoPayload 的产物同构（config 不参与指纹）。 */
function payloadFor(prompt: string, images: string[], videos: string[]) {
  return {
    req_from: 'user@example.com',
    model_name: 'seedance',
    version: 'seedance-2.0',
    mode: 'reference_image',
    prompt,
    image_list: images,
    video_list: videos,
    audio_list: [],
    config: { resolution: '1080p', duration: 15 },
  }
}

const payloadA = payloadFor(
  '占位提示词 A',
  ['https://example.invalid/assets/input-a.png'],
  ['https://example.invalid/assets/input-a.mp4'],
)

test('readAigcResult：从 result.content 取结果 URL', () => {
  const parsed = readAigcResult(newSuccess.response)
  assert.deepEqual(parsed.urls, ['https://example.invalid/results/output-a.mp4'])
  assert.equal(parsed.status, 'success')
  assert.equal(parsed.requestId, 'req_success_new')
})

test('readAigcResult：明确失败时取出真实原因（含 code），而不是「未解析到 URL」', () => {
  const parsed = readAigcResult(failed.response)
  assert.deepEqual(parsed.urls, [])
  assert.equal(parsed.status, 'failed')
  assert.match(parsed.errorMessage ?? '', /copyright restrictions/)
  assert.match(parsed.errorMessage ?? '', /OutputAudioSensitiveContentDetected/)
})

test('readAigcResult：不把回显的输入 URL 当成结果', () => {
  const echoed = { result: { content: ['https://example.invalid/assets/input-a.png'], status: 'success' } }
  const parsed = readAigcResult(echoed, new Set(['https://example.invalid/assets/input-a.png']))
  assert.deepEqual(parsed.urls, [])
})

test('指纹忽略 config：网关会补 generate_audio / watermark 等我们没发的字段', () => {
  assert.deepEqual(
    fingerprintFromPayload(newSuccess.request!),
    fingerprintFromPayload(payloadA),
  )
})

test('matchHistoryItem：request_id 命中时直接精确匹配', () => {
  const hit = matchHistoryItem(items, {
    requestId: 'req_success_old',
    fingerprint: fingerprintFromPayload(payloadA),
    submittedAt: 0,
  })
  assert.equal(hit?.id, 'rec_success_old')
})

test('matchHistoryItem：没有 request_id 时按指纹 + 时间窗认领最新的一条', () => {
  const hit = matchHistoryItem(items, {
    fingerprint: fingerprintFromPayload(payloadA),
    submittedAt: newSuccess.created_at!,
  })
  assert.equal(hit?.id, 'rec_success_new')
})

test('matchHistoryItem：时间窗把同参的旧任务挡在外面', () => {
  // 提交时刻晚于两条记录 → 都不该被认领（5 分钟时钟容差之外）
  const hit = matchHistoryItem(items, {
    fingerprint: fingerprintFromPayload(payloadA),
    submittedAt: newSuccess.created_at! + 60 * 60 * 1000,
  })
  assert.equal(hit, undefined)
})

test('matchHistoryItem：已被别的任务认领的记录跳过（同 prompt 连跑两次不互抢）', () => {
  const hit = matchHistoryItem(items, {
    fingerprint: fingerprintFromPayload(payloadA),
    submittedAt: oldSuccess.created_at!,
    claimed: new Set([claimKeyOf(newSuccess)]),
  })
  assert.equal(hit?.id, 'rec_success_old')
})

test('matchHistoryItem：prompt 不同则不认领', () => {
  const hit = matchHistoryItem(items, {
    fingerprint: fingerprintFromPayload(payloadFor('另一个提示词', [], [])),
    submittedAt: 0,
  })
  assert.equal(hit, undefined)
})

test('claimKeyOf：优先 request_id，退而用记录 id', () => {
  assert.equal(claimKeyOf(newSuccess), 'req_success_new')
  assert.equal(claimKeyOf({ id: 'rec_only' }), 'rec_only')
})
