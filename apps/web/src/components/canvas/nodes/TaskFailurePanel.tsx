import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getTaskApi, refetchTaskApi } from '@/lib/api'

/**
 * 生成失败时节点底部的错误区（图像 / 视频节点共用）。
 *
 * 上游偶尔 2xx 却不带结果 URL（长连接被掐断等），内容其实已经生成并落进了网关历史 ——
 * 这种失败不该只留一句红字了事，故这里给三条自救路径：
 *   1. 重新拉取结果：让后端再去 AIGC 历史接口认领一次；
 *   2. 手动填入 URL：从别处（如网关自带的历史页）复制回来直接用；
 *   3. 查看上游响应：把后端留存的原始响应摊开，供排查/反馈。
 */
export function TaskFailurePanel({
  message,
  taskId,
  recoverable,
  onResult,
}: {
  message: string
  /** 失败任务的 id；没有（前置校验失败等）则只显示错误文案。 */
  taskId?: string
  /** 是否值得重拉（上游明确拒绝时为 false）。 */
  recoverable?: boolean
  /** 拿到结果 URL 后回填节点。 */
  onResult: (urls: string[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [rawOpen, setRawOpen] = useState(false)
  const [raw, setRaw] = useState<string | null>(null)

  const handleRefetch = async () => {
    if (!taskId) return
    setBusy(true)
    setNote('')
    try {
      const task = await refetchTaskApi(taskId)
      if (task.result.length > 0) onResult(task.result)
      else setNote('历史记录里还没有这次生成的结果')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleManual = () => {
    const url = manualUrl.trim()
    if (!url) return
    onResult([url])
  }

  const toggleRaw = async () => {
    const next = !rawOpen
    setRawOpen(next)
    if (!next || raw !== null || !taskId) return
    try {
      const task = await getTaskApi(taskId)
      setRaw(task.rawResponse || '（后端未留存上游响应）')
    } catch (e) {
      setRaw(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="nodrag flex flex-col gap-1.5 rounded-md bg-destructive/10 p-2">
      <p className="text-[11px] break-words text-destructive">{message}</p>

      <div className="flex flex-wrap items-center gap-1">
        {taskId && recoverable && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={handleRefetch}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <RefreshCw className={`size-3 ${busy ? 'animate-spin' : ''}`} />
            重新拉取结果
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setManualOpen((v) => !v)}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <Link2 className="size-3" />
          手动填入 URL
        </Button>
        {taskId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleRaw}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            {rawOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            上游响应
          </Button>
        )}
      </div>

      {manualOpen && (
        <div className="flex items-center gap-1">
          <Input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleManual()
            }}
            placeholder="粘贴结果 URL"
            className="h-6 text-[11px]"
          />
          <Button size="sm" onClick={handleManual} className="h-6 px-2 text-[11px]">
            确定
          </Button>
        </div>
      )}

      {rawOpen && (
        <div className="flex flex-col gap-1">
          <pre className="nowheel max-h-32 overflow-auto rounded bg-background/60 p-1.5 text-[10px] leading-snug break-all whitespace-pre-wrap">
            {raw ?? '加载中…'}
          </pre>
          {raw && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void navigator.clipboard?.writeText(raw)}
              className="h-6 w-fit gap-1 px-2 text-[11px]"
            >
              <Copy className="size-3" />
              复制
            </Button>
          )}
        </div>
      )}

      {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
    </div>
  )
}
