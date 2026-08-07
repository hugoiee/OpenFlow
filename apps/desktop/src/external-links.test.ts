import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyLink } from './external-links.ts'

const APP = 'http://localhost:42617'

test('站外 http(s) 链接归为外开', () => {
  assert.equal(classifyLink('https://github.com/hugoiee/OpenFlow/releases/tag/v1.0.1', APP), 'external')
  assert.equal(classifyLink('http://example.com/a.png', APP), 'external')
  // 生成结果的图片/视频链接（带签名查询串）同样外开
  assert.equal(classifyLink('https://cdn.example.com/x.mp4?sig=abc&t=1', APP), 'external')
})

test('应用自身 origin 归为内部，不劫持', () => {
  assert.equal(classifyLink(`${APP}/`, APP), 'internal')
  // 同源下载代理：必须留在应用内，否则下载会被甩去浏览器
  assert.equal(classifyLink(`${APP}/api/download?url=x&name=y&kind=image`, APP), 'internal')
  // 开发态是 Vite dev server
  assert.equal(classifyLink('http://localhost:5173/#/project/abc', 'http://localhost:5173'), 'internal')
})

test('同机不同端口不算自己人', () => {
  assert.equal(classifyLink('http://localhost:8787/api/health', APP), 'external')
})

test('非 http(s) 与非法地址一律丢弃', () => {
  for (const bad of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'smb://server/share',
    'openflow://whatever',
    'not a url',
    '',
  ]) {
    assert.equal(classifyLink(bad, APP), 'ignore', bad)
  }
})

test('拿不到应用 origin 时，站外链接照样外开', () => {
  assert.equal(classifyLink('https://github.com/', null), 'external')
})
