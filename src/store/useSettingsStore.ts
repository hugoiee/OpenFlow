import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApiSettings } from '@/lib/types'

type SettingsState = {
  settings: ApiSettings
  updateSettings: (partial: Partial<ApiSettings>) => void
}

const DEFAULT_SETTINGS: ApiSettings = {
  baseURL: '',
  apiKey: '',
  defaultModel: 'gpt-4o-mini',
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
    }),
    { name: 'openflow-settings' },
  ),
)

/** 是否已配置可用的中转 API（base URL + key 都有）。 */
export function hasApiConfig(settings: ApiSettings): boolean {
  return Boolean(settings.baseURL.trim() && settings.apiKey.trim())
}
