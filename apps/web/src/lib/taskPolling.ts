import { getTaskApi } from './api'
import type { TaskDTO } from '@openflow/shared'

// 任务轮询：递归 setTimeout（非 setInterval，等上次 fetch 完再排下次），
// 起始 1500ms、每次 ×1.3 退避封顶 5000ms（视频生成慢）。终态或 abort 时停止。
// 瞬时 fetch 错误只记日志、下一 tick 重试，不中止（网络抖动不该让节点报错）。

const START_INTERVAL = 1500
const MAX_INTERVAL = 5000

export type PollOptions = {
  /** 每次拿到非终态状态时回调（可用于更新 UI）。 */
  onUpdate?: (task: TaskDTO) => void
  /** 传入用于取消轮询（节点卸载 / 重新运行时 abort）。 */
  signal?: AbortSignal
}

/** 轮询任务直至 succeeded/failed，返回终态 DTO。signal abort 时以 AbortError reject。 */
export function pollTask(taskId: string, opts: PollOptions = {}): Promise<TaskDTO> {
  const { onUpdate, signal } = opts
  return new Promise<TaskDTO>((resolve, reject) => {
    let interval = START_INTERVAL
    let timer: ReturnType<typeof setTimeout> | undefined

    const abort = () => {
      if (timer) clearTimeout(timer)
      reject(new DOMException('轮询已取消', 'AbortError'))
    }
    if (signal) {
      if (signal.aborted) return abort()
      signal.addEventListener('abort', abort, { once: true })
    }

    const tick = async () => {
      if (signal?.aborted) return
      try {
        const task = await getTaskApi(taskId)
        if (signal?.aborted) return
        if (task.status === 'succeeded' || task.status === 'failed') {
          signal?.removeEventListener('abort', abort)
          resolve(task)
          return
        }
        onUpdate?.(task)
      } catch (e) {
        // 瞬时错误：不中止，下一 tick 再试
        console.warn('[openflow] 轮询任务失败，稍后重试', e)
      }
      interval = Math.min(MAX_INTERVAL, Math.round(interval * 1.3))
      timer = setTimeout(tick, interval)
    }

    // 首次立即查（命中已完成的任务时无需等一个间隔）
    void tick()
  })
}
