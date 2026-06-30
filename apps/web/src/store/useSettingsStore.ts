import { create } from 'zustand'
import { getSettingsApi, saveSettingsApi } from '@/lib/api'

type SettingsState = {
  /** 全局调用方署名（req_from）；为空时后端回退默认值。 */
  defaultReqFrom: string
  loaded: boolean
  loadSettings: () => Promise<void>
  /** 保存全局 req_from 署名；保存后回拉刷新。 */
  saveReqFrom: (reqFrom: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  defaultReqFrom: '',
  loaded: false,

  loadSettings: async () => {
    const dto = await getSettingsApi()
    set({ defaultReqFrom: dto.defaultReqFrom, loaded: true })
  },

  saveReqFrom: async (reqFrom) => {
    await saveSettingsApi({ defaultReqFrom: reqFrom })
    await get().loadSettings()
  },
}))
