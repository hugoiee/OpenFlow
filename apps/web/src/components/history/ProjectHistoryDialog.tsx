import { useCallback, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import type { GenHistoryRow } from '@openflow/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { getProjectHistoryApi } from '@/lib/api'
import { toEntries, urlsToText, withResultsOnly, type HistoryEntry } from '@/lib/history'
import { useFlowStore } from '@/store/useFlowStore'

/** 稳定的空数组引用：项目查不到时若每次返回新 []，Zustand 选择器会认成变化而无限重渲染。 */
const EMPTY_NODES: never[] = []

/** 一条记录：左边是「什么时候、哪个节点、什么模型、什么 prompt」，右边是结果链接。 */
function HistoryItem({
  entry,
  onCopy,
  copiedUrl,
}: {
  entry: HistoryEntry
  onCopy: (url: string) => void
  copiedUrl: string
}) {
  const { row, urls } = entry
  const failed = row.status === 'failed'
  return (
    <div className="flex flex-col gap-1.5 border-b px-1 py-2.5 last:border-b-0">
      {/* 元信息行：时间 · 类型 · 模型 · 节点名 ·（失败时）状态 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{entry.time}</span>
        <span className="rounded-sm bg-muted px-1.5 py-px font-medium text-foreground/80">
          {entry.kind}
        </span>
        {row.model && <span>{row.model}</span>}
        <span className="min-w-0 truncate" title={`来源节点：${entry.nodeLabel}`}>
          · {entry.nodeLabel}
          {!entry.nodeExists && <span className="ml-1 opacity-60">（节点已删除）</span>}
        </span>
        {failed && <span className="text-destructive">· {entry.status}</span>}
      </div>

      {/* prompt 摘要：一屏几十条链接，光看 URL 分不清谁是谁，靠这句认人 */}
      {row.prompt && (
        <p className="line-clamp-2 select-text text-xs leading-relaxed text-foreground/80">
          {row.prompt}
        </p>
      )}

      {/* 结果链接：一条记录可能出多张图，故逐条给复制与新开 */}
      {urls.length > 0 ? (
        <div className="flex flex-col gap-1">
          {urls.map((url, i) => (
            <div key={`${url}-${i}`} className="flex items-center gap-1.5">
              {urls.length > 1 && (
                <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
              )}
              {/* 链接本体可选中——有人习惯直接拖选复制，不一定去点按钮 */}
              <code className="min-w-0 flex-1 select-text truncate rounded-sm bg-muted/60 px-1.5 py-1 font-mono text-[11px]">
                {url}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                title="复制链接"
                onClick={() => onCopy(url)}
              >
                {copiedUrl === url ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                title="在新标签页打开"
                asChild
              >
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">
          {failed ? '这次没有产出' : '结果尚未返回'}
        </p>
      )}
    </div>
  )
}

/**
 * 画布生成历史面板：本项目历次「点生成」的产出清单，核心用途是**把链接找回来**。
 * 起因是节点上只保留最后一次结果——手滑重新生成一次，上一版效果好的视频就被冲掉了。
 * 数据源是后端 tasks 表（同生成统计面板），任务行从不删除，故那条链接其实一直都在，
 * 这里只是把它读出来给人看；节点删了记录也还在（产出还在服务器上）。
 *
 * 「只看有结果的」默认开启：来这个面板就是找链接的，失败行是噪音；
 * 但不做成硬过滤——关掉开关能看到「那次确实失败了」，省得对着缺口猜。
 */

export function ProjectHistoryDialog({
  projectId,
  children,
}: {
  projectId: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<GenHistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [onlyWithResult, setOnlyWithResult] = useState(true)
  const [copiedUrl, setCopiedUrl] = useState('')
  const [copiedAll, setCopiedAll] = useState(false)

  // 节点名要跟着画布现状走（改过名就显示新名字），故从 store 现取而不是让后端存快照
  const nodes = useFlowStore(
    (s) => s.projects.find((p) => p.id === projectId)?.nodes ?? EMPTY_NODES,
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getProjectHistoryApi(projectId)
      setRows(res.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // 每次打开都重拉（同生成统计面板）：刚跑完的那条要立刻能找到。
  // 挂在 onOpenChange 而非 effect——打开是个事件不是派生状态，effect 里 setState 会被 lint 拦
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void load()
  }

  const visible = useMemo(
    () => (onlyWithResult ? withResultsOnly(rows) : rows),
    [rows, onlyWithResult],
  )
  const entries = useMemo(() => toEntries(visible, nodes), [visible, nodes])
  const urlCount = useMemo(() => entries.reduce((n, e) => n + e.urls.length, 0), [entries])

  const copy = async (text: string, mark: () => void) => {
    try {
      await navigator.clipboard.writeText(text)
      mark()
    } catch (e) {
      setError(`复制失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleCopyOne = (url: string) =>
    void copy(url, () => {
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(''), 1600)
    })

  const handleCopyAll = () =>
    void copy(urlsToText(visible), () => {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1600)
    })

  const empty = !loading && !error && entries.length === 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {/* 限高 + grid-rows：同生成统计面板，列表再长也不会把标题与工具行顶出视口 */}
      <DialogContent className="max-h-[85vh] grid-rows-[auto_1fr] gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>生成历史</DialogTitle>
          <DialogDescription>
            本画布历次「生成」的产出链接（新→旧）。节点上只留最后一次结果，被覆盖掉的那版仍能在这里找回。
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden px-6 py-4">
          {/* 工具行：只看有结果的 + 复制全部链接 + 刷新 */}
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyWithResult}
                onChange={(e) => setOnlyWithResult(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              只看有结果的
            </label>
            <span className="text-xs text-muted-foreground">
              {entries.length} 条 · {urlCount} 个链接
            </span>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={handleCopyAll}
              disabled={urlCount === 0}
              title="把当前列表里的全部链接复制到剪贴板，每行一个"
            >
              {copiedAll ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copiedAll ? '已复制' : '复制全部链接'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void load()}
              disabled={loading}
              title="重新拉取历史"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>

          {/* 列表区（唯一会滚的部分） */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {!error && loading && rows.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">加载中…</p>
            )}
            {empty && (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                {rows.length > 0
                  ? '这些记录都没有产出链接，取消勾选「只看有结果的」可以看到它们。'
                  : '本画布还没有生成记录。'}
              </p>
            )}
            {!error && entries.length > 0 && (
              <div className="h-full overflow-auto">
                {entries.map((entry) => (
                  <HistoryItem
                    key={entry.row.taskId}
                    entry={entry}
                    onCopy={handleCopyOne}
                    copiedUrl={copiedUrl}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

