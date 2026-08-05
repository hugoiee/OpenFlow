// 等待某个 TCP 端口可连接后退出（供 pnpm dev:all 让前端在后端 ready 之后再起，
// 避免 vite 先 ready、浏览器首屏请求打到还没监听的后端上报 ECONNREFUSED）。
// 用法：node scripts/wait-for-port.mjs [port] [host] [timeoutMs]
import net from 'node:net'

const port = Number(process.argv[2] ?? 8787)
const host = process.argv[3] ?? '127.0.0.1'
const timeoutMs = Number(process.argv[4] ?? 60_000)
const deadline = Date.now() + timeoutMs

const tryConnect = () =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

while (Date.now() < deadline) {
  if (await tryConnect()) process.exit(0)
  await sleep(200)
}

console.error(`[wait-for-port] ${host}:${port} 在 ${timeoutMs}ms 内未就绪，仍继续启动`)
process.exit(0)
