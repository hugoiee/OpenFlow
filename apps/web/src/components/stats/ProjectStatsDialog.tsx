import { useCallback, useMemo, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import type { GenStatRow } from '@openflow/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { getProjectStatsApi } from '@/lib/api'
import {
  DETAIL_HEADER,
  SUMMARY_HEADER,
  detailToMatrix,
  detailToTsv,
  formatTime,
  summarizeStats,
  summaryToMatrix,
  summaryToTsv,
  totalStats,
} from '@/lib/stats'

/**
 * 画布生成统计面板：把本项目历次「点生成」按模型/规格汇总，供在外部按单价核算开销。
 * 只统计图像与视频模型（播客 TTS 与 Agent LLM 调用的费用另算，不在此列）。
 * 数据源是后端 tasks 表 —— 不埋点、不新建表，历史数据天然就在；节点删了任务行仍在（钱已经花了）。
 * 两个视图（汇总 / 明细）同源：汇总即明细的 group by，故两张表的数字必然对得上，复制出去的 TSV 亦然。
 */

type View = 'summary' | 'detail'

/** 视图偏好跨会话保留（同 NodeInspector 的请求预览视图切换）。 */
const VIEW_KEY = 'openflow-stats-view'

/**
 * 各视图里「数字列」的下标（右对齐 + 等宽数字）。
 * 刻意逐列列举而非取一个起始下标：明细表的状态/节点 ID/任务 ID 排在张数、时长**之后**，
 * 用「从第 N 列起都是数字」会把这三列一起右对齐。
 */
const SUMMARY_NUMERIC = new Set([6, 7, 8, 9, 10, 11])
const DETAIL_NUMERIC = new Set([7, 8])

/** 顶部总览的一个大数。 */
function TotalCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md border bg-muted/30 px-3 py-2">
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-lg font-semibold leading-tight tabular-nums">{value}</span>
      {hint && <span className="truncate text-[10px] text-muted-foreground/80">{hint}</span>}
    </div>
  )
}

/** 统计表：表头 + 单元格矩阵，numeric 里的列右对齐并加重。 */
function StatTable({
  header,
  matrix,
  numeric,
}: {
  header: string[]
  matrix: string[][]
  numeric: Set<number>
}) {
  return (
    // 列多且内容宽（版本名 / 任务 id），横向自己滚，不让弹窗被撑破
    <div className="overflow-auto rounded-md border">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr>
            {header.map((h, i) => (
              <th
                key={h}
                className={`whitespace-nowrap border-b px-2 py-1.5 font-medium text-muted-foreground ${
                  numeric.has(i) ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={ri} className="border-b last:border-b-0 hover:bg-muted/40">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`whitespace-nowrap px-2 py-1 ${
                    numeric.has(ci)
                      ? 'text-right font-medium tabular-nums text-foreground'
                      : 'text-left text-muted-foreground'
                  }`}
                >
                  {cell || <span className="text-muted-foreground/40">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProjectStatsDialog({
  projectId,
  children,
}: {
  projectId: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<GenStatRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState<View>(() =>
    localStorage.getItem(VIEW_KEY) === 'detail' ? 'detail' : 'summary',
  )

  const pickView = (v: View) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getProjectStatsApi(projectId)
      setRows(res.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // 每次打开都重拉：面板看的是「到此刻为止花了多少」，留一份旧数据反而误导。
  // 刻意挂在 onOpenChange 而非 effect —— 打开是个事件，不是从 open 派生的状态，
  // 放 effect 里同步 setState 会被 react-hooks/set-state-in-effect 拦下（也确实多一轮渲染）。
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void load()
  }

  const groups = useMemo(() => summarizeStats(rows), [rows])
  const totals = useMemo(() => totalStats(rows), [rows])

  const handleCopy = async () => {
    const tsv = view === 'summary' ? summaryToTsv(groups) : detailToTsv(rows)
    try {
      await navigator.clipboard.writeText(tsv)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch (e) {
      setError(`复制失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const empty = !loading && !error && rows.length === 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {/* 限高 + grid-rows：同 SettingsDialog，表格再长也不会把标题与工具行顶出视口 */}
      <DialogContent className="max-h-[85vh] grid-rows-[auto_1fr] gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>生成统计</DialogTitle>
          <DialogDescription>
            本画布历次「生成」的次数与用量，供在外部按单价核算开销。只统计图像与视频模型。
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden px-6 py-4">
          {/* 总览大数 */}
          <div className="flex shrink-0 gap-2">
            <TotalCard
              label="生成次数"
              value={String(totals.total)}
              hint={`成功 ${totals.succeeded} · 失败 ${totals.failed}`}
            />
            <TotalCard label="出图张数" value={String(totals.images)} hint="仅成功任务" />
            <TotalCard
              label="视频秒数"
              value={String(totals.seconds)}
              hint={
                totals.autoDuration
                  ? `仅成功任务 · 另有 ${totals.autoDuration} 次自动时长未计`
                  : '仅成功任务'
              }
            />
            <TotalCard
              label="统计区间"
              value={totals.firstAt ? formatTime(totals.firstAt).slice(0, 10) : '—'}
              hint={totals.lastAt ? `至 ${formatTime(totals.lastAt).slice(0, 10)}` : undefined}
            />
          </div>

          {/* 工具行：视图切换 + 复制 + 刷新 */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex shrink-0 rounded-md border p-0.5">
              {(['summary', 'detail'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => pickView(v)}
                  className={`rounded-sm px-2.5 py-1 text-xs transition-colors ${
                    view === v
                      ? 'bg-primary/10 font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v === 'summary' ? `汇总（${groups.length}）` : `明细（${rows.length}）`}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={handleCopy}
              disabled={rows.length === 0}
              title="整表（含表头）复制为 TSV，可直接粘进 Excel / 飞书表格"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? '已复制' : '复制表格'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void load()}
              disabled={loading}
              title="重新拉取统计"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>

          {/* 表格区（唯一会滚的部分） */}
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
                本画布还没有图像 / 视频生成记录。
              </p>
            )}
            {!error && rows.length > 0 && (
              <div className="h-full overflow-auto">
                {view === 'summary' ? (
                  <StatTable
                    header={SUMMARY_HEADER}
                    matrix={summaryToMatrix(groups)}
                    numeric={SUMMARY_NUMERIC}
                  />
                ) : (
                  <StatTable
                    header={DETAIL_HEADER}
                    matrix={detailToMatrix(rows)}
                    numeric={DETAIL_NUMERIC}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
