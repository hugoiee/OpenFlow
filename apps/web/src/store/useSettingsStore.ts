import { create } from 'zustand'
import type { AgentModelsBody, SaveSettingsBody } from '@openflow/shared'
import { getSettingsApi, listAgentModelsApi, saveSettingsApi } from '@/lib/api'

type SettingsState = {
  /** 全局调用方署名（req_from）；为空时后端回退默认值。 */
  defaultReqFrom: string
  /** AIGC 图像/视频生成端点；为空=后端回退默认。 */
  aigcEndpoint: string
  /** 图片上传端点；为空=后端回退默认。 */
  uploadEndpoint: string
  /** 音频上传端点；为空=后端回退默认。 */
  uploadMediaEndpoint: string
  /** 画布 Agent 的 LLM 端点（OpenAI 兼容）；为空=后端回退 env。 */
  agentEndpoint: string
  /** 服务端是否已配置 Agent API Key（明文不回传，只有这个标记）。 */
  hasAgentApiKey: boolean
  /** 画布 Agent 的 LLM 模型名；为空=后端回退 env。 */
  agentModel: string
  /** 手动维护的模型候选列表（持久化）；与动态获取的 agentModels 取并集作下拉选项。 */
  agentModelList: string[]
  loaded: boolean
  /** 从端点 GET /models 动态获取到的可用模型 ID（供 Agent 模型名 / Any LLM 节点下拉共用）。 */
  agentModels: string[]
  /** 模型列表是否正在获取中。 */
  agentModelsLoading: boolean
  /** 是否已尝试过获取（无论成败）；用于避免重复自动拉取，保存设置后置 false 触发重取。 */
  agentModelsLoaded: boolean
  /** 上次获取失败的可读原因（成功为空）；非空时前端回退成手填模型名。 */
  agentModelsError: string
  loadSettings: () => Promise<void>
  /** 保存设置（部分字段即可，省略的后端保持原值）；保存后回拉刷新并使模型列表失效重取。 */
  saveSettings: (body: SaveSettingsBody) => Promise<void>
  /** 仅保存全局 req_from 署名（端点由后端合并保留）；保存后回拉刷新。 */
  saveReqFrom: (reqFrom: string) => Promise<void>
  /**
   * 拉取端点可用模型列表（写入 agentModels）。override 省略=用已存设置。
   * 不抛错：失败时置空 agentModels 并存 agentModelsError，供 UI 回退手填。
   */
  loadAgentModels: (override?: AgentModelsBody) => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  defaultReqFrom: '',
  aigcEndpoint: '',
  uploadEndpoint: '',
  uploadMediaEndpoint: '',
  agentEndpoint: '',
  hasAgentApiKey: false,
  agentModel: '',
  agentModelList: [],
  loaded: false,
  agentModels: [],
  agentModelsLoading: false,
  agentModelsLoaded: false,
  agentModelsError: '',

  loadSettings: async () => {
    const dto = await getSettingsApi()
    set({
      defaultReqFrom: dto.defaultReqFrom,
      aigcEndpoint: dto.aigcEndpoint,
      uploadEndpoint: dto.uploadEndpoint,
      uploadMediaEndpoint: dto.uploadMediaEndpoint,
      agentEndpoint: dto.agentEndpoint,
      hasAgentApiKey: dto.hasAgentApiKey ?? false,
      agentModel: dto.agentModel,
      agentModelList: dto.agentModelList ?? [],
      loaded: true,
    })
  },

  saveSettings: async (body) => {
    await saveSettingsApi(body)
    await get().loadSettings()
    // 端点/密钥/模型可能变了：让模型列表失效，下次消费方（设置面板 / 节点）按新配置重取
    set({ agentModels: [], agentModelsLoaded: false, agentModelsError: '' })
  },

  saveReqFrom: async (reqFrom) => {
    await get().saveSettings({ defaultReqFrom: reqFrom })
  },

  loadAgentModels: async (override) => {
    set({ agentModelsLoading: true, agentModelsError: '' })
    try {
      const models = await listAgentModelsApi(override ?? {})
      set({ agentModels: models, agentModelsLoaded: true, agentModelsLoading: false })
    } catch (e) {
      // 失败不抛：置空列表 + 存错误，UI 据此回退手填模型名
      set({
        agentModels: [],
        agentModelsLoaded: true,
        agentModelsLoading: false,
        agentModelsError: e instanceof Error ? e.message : String(e),
      })
    }
  },
}))
