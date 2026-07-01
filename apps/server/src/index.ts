import { startServer } from './server'

// 独立开发入口（pnpm dev:all / pnpm server）：固定 8787，数据走源码相对目录。
const port = Number(process.env.PORT ?? 8787)
startServer({ port }).then(({ port }) => {
  console.log(`[openflow-server] listening on http://localhost:${port}`)
})

export { createApp } from './app'
export { startServer } from './server'
