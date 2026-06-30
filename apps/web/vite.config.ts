import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 端口默认 5173；若注入了 PORT 环境变量则用它（便于预览工具分配空闲端口）
    port: Number(process.env.PORT) || 5173,
    // 开发期把 /api 转发到同仓 Node 服务
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
