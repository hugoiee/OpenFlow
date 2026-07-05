import { create } from 'zustand'
import type { PromptPresetCategory, PromptPresetDTO } from '@openflow/shared'
import {
  createPromptPresetApi,
  deletePromptPresetApi,
  listPromptPresetsApi,
  updatePromptPresetApi,
} from '@/lib/api'

type PromptPresetState = {
  /** 全局 Prompt 预设（最近更新在前，与后端排序一致），按 category 分「常用 / System」两组。 */
  presets: PromptPresetDTO[]
  loaded: boolean
  loadPresets: () => Promise<void>
  /** 新建一条预设（乐观置顶）。 */
  addPreset: (title: string, content: string, category: PromptPresetCategory) => Promise<void>
  /** 更新一条预设（更新后置顶，对齐后端 updated_at 排序）。 */
  editPreset: (
    id: string,
    title: string,
    content: string,
    category: PromptPresetCategory,
  ) => Promise<void>
  /** 删除一条预设。 */
  removePreset: (id: string) => Promise<void>
}

export const usePromptPresetStore = create<PromptPresetState>()((set) => ({
  presets: [],
  loaded: false,

  loadPresets: async () => {
    const presets = await listPromptPresetsApi()
    set({ presets, loaded: true })
  },

  addPreset: async (title, content, category) => {
    const created = await createPromptPresetApi({ title, content, category })
    set((s) => ({ presets: [created, ...s.presets] }))
  },

  editPreset: async (id, title, content, category) => {
    const updated = await updatePromptPresetApi(id, { title, content, category })
    set((s) => ({ presets: [updated, ...s.presets.filter((p) => p.id !== id)] }))
  },

  removePreset: async (id) => {
    await deletePromptPresetApi(id)
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
  },
}))
