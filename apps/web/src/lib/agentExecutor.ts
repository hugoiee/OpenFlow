import type { AgentImageAction } from '@openflow/shared'
import { createImageTaskApi } from './api'
import {
  IMAGE_SIZE_DEFAULT,
  NANO_ASPECT_DEFAULT,
  NANO_IMAGE_SIZE_DEFAULT,
  NANO_VERSION_DEFAULT,
  imageApiModel,
} from './nodeCatalog'
import { useFlowStore } from '@/store/useFlowStore'

export type ExecutedAction = {
  title?: string
  ok: boolean
  error?: string
}

/**
 * 把 Agent 计划落到画布：逐个动作建「Prompt → 图像」节点并连线 → 建生图异步任务 →
 * 把 taskId 写进图像节点 data。后续轮询与结果展示由 ImageNode 内置的 taskId 重连
 * effect 接管（与手动点「生成」后刷新重连是同一条链路，节点组件零改动）。
 */
export async function executeAgentActions(
  projectId: string,
  actions: AgentImageAction[],
): Promise<ExecutedAction[]> {
  const results: ExecutedAction[] = []
  for (const action of actions) {
    const store = useFlowStore.getState()
    // 等待 LLM 期间用户可能切走画布：不要把节点建到别的项目里
    if (store.activeProjectId !== projectId) {
      results.push({ title: action.title, ok: false, error: '画布已切换，该动作未执行' })
      continue
    }
    const ids = store.addAgentGeneration({
      prompt: action.prompt,
      model: action.model,
      title: action.title,
    })
    if (!ids) {
      results.push({ title: action.title, ok: false, error: '未找到当前项目' })
      continue
    }
    try {
      const apiModel = imageApiModel(action.model)
      const isNano = apiModel === 'nano-banana'
      const taskId = await createImageTaskApi({
        projectId,
        nodeId: ids.imageNodeId,
        model: apiModel,
        prompt: action.prompt,
        images: [],
        // 与 ImageNode 手动运行同构：按模型分组传参，未用到的一组留空（后端按 model 取舍）
        ...(isNano
          ? {
              version: NANO_VERSION_DEFAULT,
              aspectRatio: NANO_ASPECT_DEFAULT,
              imageSize: NANO_IMAGE_SIZE_DEFAULT,
              size: '',
              n: 1,
              quality: '',
            }
          : { size: IMAGE_SIZE_DEFAULT, n: 1, quality: 'auto' }),
      })
      // 显式按项目写回：等待请求期间用户切走画布也不丢 taskId（回来时节点凭它重连轮询）
      useFlowStore.getState().updateNodeDataInProject(projectId, ids.imageNodeId, { taskId })
      results.push({ title: action.title, ok: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // 建任务失败（如 req_from 未填 400）：错误落在节点上内联展示，节点保留供手动重试
      useFlowStore
        .getState()
        .updateNodeDataInProject(projectId, ids.imageNodeId, { error: message })
      results.push({ title: action.title, ok: false, error: message })
    }
  }
  return results
}
