import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { migrateLocalStorage } from '@/lib/migrate'
import { useFlowStore } from '@/store/useFlowStore'
import { usePromptPresetStore } from '@/store/usePromptPresetStore'
import { useSettingsStore } from '@/store/useSettingsStore'

// 启动：先一次性迁移旧 localStorage 数据，再从后端加载，最后渲染。
async function bootstrap() {
  await migrateLocalStorage()
  await Promise.allSettled([
    useFlowStore.getState().loadProjects(),
    useSettingsStore.getState().loadSettings(),
    usePromptPresetStore.getState().loadPresets(),
  ])
}

bootstrap().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  )
})
