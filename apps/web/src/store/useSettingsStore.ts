import { create } from 'zustand'
import type { SaveSettingsBody } from '@openflow/shared'
import { getSettingsApi, saveSettingsApi } from '@/lib/api'

type SettingsState = {
  /** 全局调用方署名（req_from）；为空时后端回退默认值。 */
  defaultReqFrom: string
  /** AIGC 图像/视频生成端点；为空=后端回退默认。 */
  aigcEndpoint: string
  /** 图片上传端点；为空=后端回退默认。 */
  uploadEndpoint: string
  /** 音频上传端点；为空=后端回退默认。 */
  uploadMediaEndpoint: string
  loaded: boolean
  loadSettings: () => Promise<void>
  /** 保存设置（部分字段即可，省略的后端保持原值）；保存后回拉刷新。 */
  saveSettings: (body: SaveSettingsBody) => Promise<void>
  /** 仅保存全局 req_from 署名（端点由后端合并保留）；保存后回拉刷新。 */
  saveReqFrom: (reqFrom: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  defaultReqFrom: '',
  aigcEndpoint: '',
  uploadEndpoint: '',
  uploadMediaEndpoint: '',
  loaded: false,

  loadSettings: async () => {
    const dto = await getSettingsApi()
    set({
      defaultReqFrom: dto.defaultReqFrom,
      aigcEndpoint: dto.aigcEndpoint,
      uploadEndpoint: dto.uploadEndpoint,
      uploadMediaEndpoint: dto.uploadMediaEndpoint,
      loaded: true,
    })
  },

  saveSettings: async (body) => {
    await saveSettingsApi(body)
    await get().loadSettings()
  },

  saveReqFrom: async (reqFrom) => {
    await get().saveSettings({ defaultReqFrom: reqFrom })
  },
}))
