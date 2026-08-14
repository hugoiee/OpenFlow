// LLM 接入层纯函数单测：两套线格式（Responses / Chat Completions）的字段名、嵌套层级、
// 参数下限完全不同，靠肉眼比对必然漂移；且本仓没有 fetch mock 先例，纯函数是唯一可测面。
// 重点钉三类历史坑：切协议时旧后缀没剥干净、output_text 空串短路、reasoning 项混排。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SettingsDTO } from '@openflow/shared'
import {
  buildExpandRequestBody,
  buildPlanRequestBody,
  buildProbeRequestBody,
  normalizeAgentApiStyle,
  readLlmText,
  resolveAgentConfig,
  resolveLlmUrl,
  resolveModelsUrl,
} from './llm'

// ---- 端点推导 ----

test('resolveLlmUrl：基址按协议补对应后缀', () => {
  assert.equal(resolveLlmUrl('https://gw/v1', 'chat'), 'https://gw/v1/chat/completions')
  assert.equal(resolveLlmUrl('https://gw/v1', 'responses'), 'https://gw/v1/responses')
})

test('resolveLlmUrl：已带本协议后缀时幂等', () => {
  assert.equal(resolveLlmUrl('https://gw/v1/responses', 'responses'), 'https://gw/v1/responses')
  assert.equal(
    resolveLlmUrl('https://gw/v1/chat/completions', 'chat'),
    'https://gw/v1/chat/completions',
  )
})

test('resolveLlmUrl：切协议时剥掉另一种后缀（不剥就会拼成 .../chat/completions/responses）', () => {
  assert.equal(
    resolveLlmUrl('https://gw/v1/chat/completions', 'responses'),
    'https://gw/v1/responses',
  )
  assert.equal(resolveLlmUrl('https://gw/v1/responses', 'chat'), 'https://gw/v1/chat/completions')
})

test('resolveLlmUrl：保住查询串（Azure ?api-version=）与尾斜杠归一', () => {
  assert.equal(
    resolveLlmUrl('https://gw/v1?api-version=2024-05-01', 'responses'),
    'https://gw/v1/responses?api-version=2024-05-01',
  )
  assert.equal(resolveLlmUrl('https://gw/v1//', 'responses'), 'https://gw/v1/responses')
})

test('resolveLlmUrl：非法 URL 退回字符串拼接（不抛，交给 fetch 报错）', () => {
  assert.equal(resolveLlmUrl('not a url', 'responses'), 'not a url/responses')
})

test('resolveModelsUrl：两种后缀与基址都推出同一个 /models（故切协议无需重取模型列表）', () => {
  assert.equal(resolveModelsUrl('https://gw/v1'), 'https://gw/v1/models')
  assert.equal(resolveModelsUrl('https://gw/v1/chat/completions'), 'https://gw/v1/models')
  assert.equal(resolveModelsUrl('https://gw/v1/responses'), 'https://gw/v1/models')
  assert.equal(resolveModelsUrl('https://gw/v1/models'), 'https://gw/v1/models')
  assert.equal(
    resolveModelsUrl('https://gw/v1?api-version=x'),
    'https://gw/v1/models?api-version=x',
  )
})

// ---- 请求体构造 ----

const MSGS = [
  { role: 'user' as const, content: '画一只猫' },
  { role: 'assistant' as const, content: '好的' },
]

test('buildPlanRequestBody：chat 把系统提示词作为 messages 首项', () => {
  assert.deepEqual(buildPlanRequestBody('chat', { model: 'm', systemPrompt: 'SYS', messages: MSGS }), {
    model: 'm',
    messages: [{ role: 'system', content: 'SYS' }, ...MSGS],
    temperature: 0.6,
  })
})

test('buildPlanRequestBody：responses 走 instructions，input 里不混 system', () => {
  const body = buildPlanRequestBody('responses', {
    model: 'm',
    systemPrompt: 'SYS',
    messages: MSGS,
  }) as Record<string, unknown>
  assert.deepEqual(body, {
    model: 'm',
    instructions: 'SYS',
    input: [
      { role: 'user', content: '画一只猫' },
      { role: 'assistant', content: '好的' },
    ],
    temperature: 0.6,
  })
  assert.equal('messages' in body, false)
})

test('buildExpandRequestBody：chat 只发一条 user、无 system', () => {
  assert.deepEqual(buildExpandRequestBody('chat', { model: 'm', prompt: 'P' }), {
    model: 'm',
    messages: [{ role: 'user', content: 'P' }],
    temperature: 0.6,
  })
})

test('buildExpandRequestBody：responses 的 input 是裸字符串且不带 instructions', () => {
  const body = buildExpandRequestBody('responses', { model: 'm', prompt: 'P' }) as Record<
    string,
    unknown
  >
  assert.deepEqual(body, { model: 'm', input: 'P', temperature: 0.6 })
  assert.equal('instructions' in body, false)
})

test('buildProbeRequestBody：responses 用 max_output_tokens 16（下限，写 1 会被 400）', () => {
  assert.deepEqual(buildProbeRequestBody('responses', { model: 'm' }), {
    model: 'm',
    input: 'ping',
    max_output_tokens: 16,
    temperature: 0,
  })
  assert.deepEqual(buildProbeRequestBody('chat', { model: 'm' }), {
    model: 'm',
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    temperature: 0,
  })
})

// ---- 响应解析：chat ----

test('readLlmText(chat)：取 choices[0].message.content 并 trim', () => {
  const r = readLlmText('chat', { choices: [{ message: { content: '  HI  ' } }] })
  assert.deepEqual(r, { text: 'HI' })
})

test('readLlmText(chat)：空内容/形状不符 → 带原文标志的错误', () => {
  assert.deepEqual(readLlmText('chat', { choices: [{ message: { content: '' } }] }), {
    error: '返回内容为空或非 chat/completions 格式',
    withRaw: true,
  })
  assert.deepEqual(readLlmText('chat', null), {
    error: '返回内容为空或非 chat/completions 格式',
    withRaw: true,
  })
})

test('readLlmText(chat)：refusal 与 content_filter 翻译成可读原因', () => {
  assert.deepEqual(readLlmText('chat', { choices: [{ message: { refusal: '不便回答' } }] }), {
    error: '模型拒绝作答：不便回答',
  })
  assert.deepEqual(
    readLlmText('chat', { choices: [{ finish_reason: 'content_filter', message: {} }] }),
    { error: '内容被上游安全策略拦截' },
  )
})

// ---- 响应解析：responses ----

test('readLlmText(responses)：跳过 reasoning 项，取 message 的 output_text', () => {
  const r = readLlmText('responses', {
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: 'HELLO' }] },
    ],
  })
  assert.deepEqual(r, { text: 'HELLO' })
})

test('readLlmText(responses)：顶层 output_text 非空时优先采用', () => {
  const r = readLlmText('responses', { output_text: 'FLAT', output: [] })
  assert.deepEqual(r, { text: 'FLAT' })
})

test('readLlmText(responses)：output_text 为空串时不能短路，仍走 output[]', () => {
  const r = readLlmText('responses', {
    output_text: '',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'REAL' }] }],
  })
  assert.deepEqual(r, { text: 'REAL' })
})

test('readLlmText(responses)：一条 message 内多个分片按序拼接', () => {
  const r = readLlmText('responses', {
    output: [
      {
        type: 'message',
        content: [
          { type: 'output_text', text: 'A' },
          { type: 'output_text', text: 'B' },
        ],
      },
    ],
  })
  assert.deepEqual(r, { text: 'AB' })
})

test('readLlmText(responses)：软失败（incomplete / refusal / failed）给出具体原因', () => {
  assert.deepEqual(
    readLlmText('responses', {
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'reasoning' }],
    }),
    { error: '生成未完成（max_output_tokens）' },
  )
  assert.deepEqual(
    readLlmText('responses', {
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: '不便回答' }] }],
    }),
    { error: '模型拒绝作答：不便回答' },
  )
  assert.deepEqual(
    readLlmText('responses', { status: 'failed', error: { message: '上游炸了' } }),
    { error: '上游报告生成失败：上游炸了' },
  )
})

test('readLlmText(responses)：协议选错收到 chat 形状时不空指针，附原文诊断', () => {
  assert.deepEqual(readLlmText('responses', { choices: [{ message: { content: 'HI' } }] }), {
    error: '返回内容为空或非 responses 格式',
    withRaw: true,
  })
})

// ---- 协议归一与配置解析 ----

test('normalizeAgentApiStyle：脏值/空一律回退 responses', () => {
  assert.equal(normalizeAgentApiStyle('responses'), 'responses')
  assert.equal(normalizeAgentApiStyle('CHAT'), 'chat')
  assert.equal(normalizeAgentApiStyle(''), 'responses')
  assert.equal(normalizeAgentApiStyle(undefined), 'responses')
  assert.equal(normalizeAgentApiStyle(123), 'responses')
})

/** 只有 agent 四项有意义，其余字段填空即可。 */
const settings = (patch: Partial<SettingsDTO> = {}): SettingsDTO => ({
  defaultReqFrom: 'v_hugo',
  aigcEndpoint: '',
  uploadEndpoint: '',
  uploadMediaEndpoint: '',
  aigcHistoryEndpoint: '',
  agentEndpoint: 'https://saved/v1',
  agentApiStyle: 'chat',
  agentApiKey: 'saved-key',
  agentModel: 'saved-model',
  agentModelList: [],
  volcTtsApiKey: '',
  ...patch,
})

test('resolveAgentConfig：override 覆盖已存设置', () => {
  assert.deepEqual(
    resolveAgentConfig(settings(), {
      endpoint: 'https://draft/v1',
      apiKey: 'draft-key',
      model: 'draft-model',
      apiStyle: 'responses',
    }),
    {
      endpoint: 'https://draft/v1',
      apiKey: 'draft-key',
      model: 'draft-model',
      apiStyle: 'responses',
    },
  )
})

test('resolveAgentConfig：无 override 时用设置值，协议空串回退默认 responses', () => {
  assert.equal(resolveAgentConfig(settings()).apiStyle, 'chat')
  assert.equal(resolveAgentConfig(settings({ agentApiStyle: '' })).apiStyle, 'responses')
})

test('resolveAgentConfig：缺端点/模型的报错须含「请在设置中填写」（路由靠它分流 400）', () => {
  assert.throws(() => resolveAgentConfig(settings({ agentEndpoint: '' })), (e: Error) =>
    e.message.includes('请在设置中填写'),
  )
  assert.throws(() => resolveAgentConfig(settings({ agentModel: '' })), (e: Error) =>
    e.message.includes('请在设置中填写'),
  )
})

test('resolveAgentConfig：requireModel=false 时缺模型不抛（列模型用）', () => {
  assert.equal(resolveAgentConfig(settings({ agentModel: '' }), undefined, {
    requireModel: false,
  }).model, '')
})
