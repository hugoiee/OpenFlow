import { create } from 'zustand'

/** 主题模式：明确浅色 / 深色，或跟随操作系统。 */
export type ThemeMode = 'light' | 'dark' | 'system'

// 主题偏好是纯 UI 偏好，同 homeView 存 localStorage（不进后端）
const THEME_KEY = 'openflow-theme'

function loadThemeMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/** 把模式解析成实际生效的明暗（system 跟随操作系统）。 */
function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (darkQuery.matches ? 'dark' : 'light') : mode
}

// 给 <html> 挂/摘 .dark：shadcn 语义色变量与 Tailwind dark: 变体都以此类为准
function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

type ThemeState = {
  mode: ThemeMode
  /** 实际生效的明暗（system 已解析），供 React Flow colorMode 等消费。 */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeState>()((set) => {
  const mode = loadThemeMode()
  const resolved = resolveTheme(mode)
  // index.html 的防白闪脚本已在首帧前挂过类，这里以 store 为准再校正一次
  applyTheme(resolved)

  // 跟随系统：仅在 system 模式下响应操作系统明暗切换
  darkQuery.addEventListener('change', () => {
    set((state) => {
      if (state.mode !== 'system') return state
      const next = resolveTheme('system')
      applyTheme(next)
      return { resolved: next }
    })
  })

  return {
    mode,
    resolved,
    setMode: (next) => {
      localStorage.setItem(THEME_KEY, next)
      const nextResolved = resolveTheme(next)
      applyTheme(nextResolved)
      set({ mode: next, resolved: nextResolved })
    },
  }
})
