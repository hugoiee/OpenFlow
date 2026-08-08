// buildVideoPayload 的三套 config 形状单测（seedance / kling / MiniMax-H3）。
// 断言值直接对齐 docs/模型适配.md 里的示例请求体——三家网关字段名与类型都不一样
// （可灵 duration 是字符串、MiniMax 的水印键带连字符、多镜头模式整个不发 prompt），
// 靠肉眼比对必然漂移，故钉成测试。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVideoPayload } from './provider'

const IMG = 'https://example.com/a.png'
const VID = 'https://example.com/a.mp4'
const AUD = 'https://example.com/a.wav'

/** 各用例共用的必填项（reqFrom 非空，否则 resolveReqFrom 抛错）。 */
const base = {
  reqFrom: 'v_hugo',
  prompt: '一只猫',
  images: [IMG],
  audios: [] as string[],
  videos: [] as string[],
  resolution: '720p',
  duration: 5,
}

test('seedance 2.5：config 带 generate_audio，ratio 为空时不下发', () => {
  const payload = buildVideoPayload({
    ...base,
    model: 'seedance',
    version: 'doubao-seedance-2-5-260628',
    mode: 'first_last_frame',
    videos: [VID],
    audios: [AUD],
    ratio: 'adaptive',
    duration: -1,
    generateAudio: true,
  })
  assert.deepEqual(payload, {
    req_from: 'v_hugo',
    model_name: 'seedance',
    version: 'doubao-seedance-2-5-260628',
    mode: 'first_last_frame',
    prompt: '一只猫',
    image_list: [IMG],
    video_list: [VID],
    audio_list: [AUD],
    config: { resolution: '720p', duration: -1, ratio: 'adaptive', generate_audio: true },
  })
})

test('seedance 旧版本：没传 generateAudio 就不出现该键（让网关用自己的默认）', () => {
  const payload = buildVideoPayload({
    ...base,
    model: 'seedance',
    version: 'seedance-2.0',
    mode: 'reference_image',
  })
  assert.deepEqual(payload.config, { resolution: '720p', duration: 5 })
})

test('kling 单镜头：duration 是字符串，sound/mode/aspect_ratio 齐全，不发 video_list/audio_list', () => {
  const payload = buildVideoPayload({
    ...base,
    model: 'kling',
    version: 'kling-v3-omni-global',
    mode: 'reference_image',
    // 上游只吃图，即便前端误传音视频也不该出现在请求里
    videos: [VID],
    audios: [AUD],
    ratio: '16:9',
    duration: 15,
    sound: true,
    qualityMode: 'pro',
    multiShot: false,
  })
  assert.deepEqual(payload, {
    req_from: 'v_hugo',
    model_name: 'kling',
    version: 'kling-v3-omni-global',
    mode: 'reference_image',
    prompt: '一只猫',
    image_list: [IMG],
    config: {
      duration: '15',
      sound: 'on',
      mode: 'pro',
      aspect_ratio: '16:9',
      multi_shot: false,
    },
  })
})

test('kling 多镜头：不发 prompt，改发 multi_prompt + shot_type', () => {
  const payload = buildVideoPayload({
    ...base,
    model: 'kling',
    version: 'kling-v3-omni-global',
    mode: 'first_last_frame',
    ratio: '16:9',
    duration: 15,
    sound: false,
    qualityMode: 'std',
    multiShot: true,
    shots: [
      { prompt: '分镜1', duration: 5 },
      { prompt: '分镜2', duration: 10 },
      // 空 prompt 的段被丢弃，index 按剩下的重新编号
      { prompt: '   ', duration: 3 },
    ],
  })
  assert.ok(!('prompt' in payload), '多镜头模式不应带 prompt 字段')
  assert.deepEqual(payload.config, {
    duration: '15',
    sound: 'off',
    mode: 'std',
    aspect_ratio: '16:9',
    multi_shot: true,
    shot_type: 'customize',
  })
  assert.deepEqual(payload.multi_prompt, [
    { index: 1, prompt: '分镜1', duration: '5' },
    { index: 2, prompt: '分镜2', duration: '10' },
  ])
})

test('kling 勾了多镜头但一段有效分镜都没有：退回单镜头，照发 prompt', () => {
  const payload = buildVideoPayload({
    ...base,
    model: 'kling',
    version: 'kling-v3-omni-global',
    mode: 'reference_image',
    multiShot: true,
    shots: [{ prompt: '  ', duration: 5 }],
  })
  assert.equal(payload.prompt, '一只猫')
  assert.ok(!('multi_prompt' in payload))
  assert.equal((payload.config as Record<string, unknown>).multi_shot, false)
})

test('MiniMax-H3 参考帧：config 用 aigc-watermark；空的音视频列表不下发', () => {
  const payload = buildVideoPayload({
    ...base,
    model: 'MiniMax-H3',
    version: 'MiniMax-H3',
    mode: 'reference_frame',
    resolution: '768P',
    ratio: 'adaptive',
    duration: 5,
    watermark: false,
  })
  assert.deepEqual(payload, {
    req_from: 'v_hugo',
    model_name: 'MiniMax-H3',
    version: 'MiniMax-H3',
    mode: 'reference_frame',
    prompt: '一只猫',
    image_list: [IMG],
    config: {
      resolution: '768P',
      ratio: 'adaptive',
      duration: 5,
      'aigc-watermark': false,
    },
  })
})

test('MiniMax-H3 参考帧：有音视频参考时才带上 video_list / audio_list', () => {
  const payload = buildVideoPayload({
    ...base,
    model: 'MiniMax-H3',
    version: 'MiniMax-H3',
    mode: 'reference_frame',
    resolution: '2K',
    videos: [VID],
    audios: [AUD],
  })
  assert.deepEqual(payload.video_list, [VID])
  assert.deepEqual(payload.audio_list, [AUD])
})

test('req_from 为空一律拒发（三个模型共用同一道闸）', () => {
  for (const model of ['seedance', 'kling', 'MiniMax-H3']) {
    assert.throws(
      () => buildVideoPayload({ ...base, reqFrom: '  ', model, version: 'v', mode: 'reference_image' }),
      /req_from/,
    )
  }
})
