import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProviderConfig, ProviderId } from '@/lib/types'

type SettingsState = {
  activeProviderId: ProviderId
  configs: Partial<Record<ProviderId, ProviderConfig>>
  setActiveProvider: (id: ProviderId) => void
  updateProviderConfig: (id: ProviderId, partial: Partial<ProviderConfig>) => void
}

/** 一份空白供应商配置。 */
export function emptyProviderConfig(): ProviderConfig {
  return { apiKey: '', baseURL: '', selectedModel: '', models: [] }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      activeProviderId: 'openai',
      configs: {},
      setActiveProvider: (id) => set({ activeProviderId: id }),
      updateProviderConfig: (id, partial) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [id]: { ...emptyProviderConfig(), ...state.configs[id], ...partial },
          },
        })),
    }),
    {
      name: 'openflow-settings',
      version: 1,
      // 旧版（v0）扁平配置 { settings: { baseURL, apiKey, defaultModel } } → 迁移到「自定义」供应商
      migrate: (persisted, version) => {
        if (version === 0 && persisted && typeof persisted === 'object') {
          const old = (persisted as { settings?: Record<string, string> }).settings
          if (old?.baseURL || old?.apiKey) {
            return {
              activeProviderId: 'custom' as ProviderId,
              configs: {
                custom: {
                  baseURL: old.baseURL ?? '',
                  apiKey: old.apiKey ?? '',
                  selectedModel: old.defaultModel ?? '',
                  models: [],
                },
              },
            }
          }
        }
        return persisted as SettingsState
      },
    },
  ),
)

/** 取当前激活供应商的配置（未配置则 undefined）。 */
export function getActiveConfig(state: {
  activeProviderId: ProviderId
  configs: Partial<Record<ProviderId, ProviderConfig>>
}): ProviderConfig | undefined {
  return state.configs[state.activeProviderId]
}

/** 当前激活供应商是否已配置可用（baseURL + key 都有）。 */
export function hasApiConfig(state: {
  activeProviderId: ProviderId
  configs: Partial<Record<ProviderId, ProviderConfig>>
}): boolean {
  const config = getActiveConfig(state)
  return Boolean(config?.baseURL.trim() && config?.apiKey.trim())
}
