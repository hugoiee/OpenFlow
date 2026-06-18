import { create } from 'zustand'
import type {
  ProviderConfigPublic,
  ProviderId,
  SaveSettingsBody,
} from '@openflow/shared'
import { getSettingsApi, saveSettingsApi } from '@/lib/api'

type SettingsState = {
  activeProviderId: ProviderId
  /** 各供应商的「公开」配置：含 baseURL/selectedModel/models/hasKey，但**不含 key**（key 只在后端）。 */
  configs: Partial<Record<ProviderId, ProviderConfigPublic>>
  loaded: boolean
  loadSettings: () => Promise<void>
  /** 保存某供应商配置并设为激活；apiKey 留空则后端保留原 key。保存后回拉刷新。 */
  saveProvider: (body: SaveSettingsBody) => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  activeProviderId: 'openai',
  configs: {},
  loaded: false,

  loadSettings: async () => {
    const dto = await getSettingsApi()
    set({ activeProviderId: dto.activeProviderId, configs: dto.configs, loaded: true })
  },

  saveProvider: async (body) => {
    await saveSettingsApi(body)
    await get().loadSettings()
  },
}))

/** 取当前激活供应商的公开配置（未配置则 undefined）。 */
export function getActiveConfig(state: {
  activeProviderId: ProviderId
  configs: Partial<Record<ProviderId, ProviderConfigPublic>>
}): ProviderConfigPublic | undefined {
  return state.configs[state.activeProviderId]
}

/** 当前激活供应商是否已配置可用（有 baseURL + 已存 key）。 */
export function hasApiConfig(state: {
  activeProviderId: ProviderId
  configs: Partial<Record<ProviderId, ProviderConfigPublic>>
}): boolean {
  const config = getActiveConfig(state)
  return Boolean(config?.baseURL && config?.hasKey)
}
