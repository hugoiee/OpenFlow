import { contextBridge } from 'electron'

// 渲染进程仅通过 fetch 访问本地 /api，无需暴露 Node 能力；预留一个标记位供前端识别桌面端。
contextBridge.exposeInMainWorld('openflow', { desktop: true })
