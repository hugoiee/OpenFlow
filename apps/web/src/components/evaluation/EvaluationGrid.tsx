import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Clock,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCompositionField } from '@/hooks/useCompositionField'
import {
  cellValue,
  clampColumnWidth,
  clampRowHeight,
  rowHeightOf,
  EVALUATION_DEFAULT_COL_WIDTH,
  type EvaluationColumn,
  type EvaluationRow,
  type EvaluationTable,
} from '@/lib/evaluation'
import { cn } from '@/lib/utils'
import { useFlowStore } from '@/store/useFlowStore'

/**
 * 拖拽调尺寸的通用底座（列宽走 x 轴、行高走 y 轴，两处共用）。
 * 照 useResizableWidth 的做法：pointermove 按 rAF 合帧、拖动中只更新本地预览态，
 * **松手才提交一次**——每帧写 store 会触发整表重渲染 + 防抖 PUT，拖起来会顿。
 */
function beginDrag(
  e: React.PointerEvent,
  opts: {
    axis: 'x' | 'y'
    start: number
    clamp: (v: number) => number
    onPreview: (v: number) => void
    onEnd: () => void
    onCommit: (v: number) => void
  },
) {
  e.preventDefault()
  e.stopPropagation()
  const origin = opts.axis === 'x' ? e.clientX : e.clientY
  let next = opts.start
  let raf = 0
  const onMove = (ev: PointerEvent) => {
    const now = opts.axis === 'x' ? ev.clientX : ev.clientY
    next = opts.clamp(opts.start + (now - origin))
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      opts.onPreview(next)
    })
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (raf) cancelAnimationFrame(raf)
    opts.onEnd()
    if (next !== opts.start) opts.onCommit(next)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  document.body.style.cursor = opts.axis === 'x' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
}

/** 行号列与行操作列的固定宽度（px）：原来是 w-12 / w-10，改 colgroup 后要具体数值。 */
const ROW_NUM_WIDTH = 48
const ROW_ACT_WIDTH = 40

type GridProps = {
  projectId: string
  table: EvaluationTable
  /** 正在跑的 LLM 列 id：列头显示进度、禁用重复触发。 */
  runningColumns: string[]
  onAddRow: () => void
  onDeleteRow: (rowId: string) => void
  onRenameColumn: (columnId: string, name: string) => void
  /** 列宽提交；width=undefined 表示重置回默认宽。 */
  onResizeColumn: (columnId: string, width: number | undefined) => void
  /** 行高提交；height=undefined 表示清除本行覆盖、回落表级行高。 */
  onResizeRow: (rowId: string, height: number | undefined) => void
  onDeleteColumn: (columnId: string) => void
  onEditLlmColumn: (column: EvaluationColumn) => void
  onRunColumn: (columnId: string) => void
  onRunCell: (columnId: string, rowId: string) => void
}

/** LLM 单元格的状态角标（数据列不显示）。 */
function CellStatusIcon({ status }: { status?: string }) {
  if (status === 'pending') return <Clock className="size-3 text-muted-foreground" />
  if (status === 'running')
    return <Loader2 className="size-3 animate-spin text-muted-foreground" />
  if (status === 'done')
    return <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
  if (status === 'error') return <X className="size-3 text-destructive" />
  return null
}

/**
 * 一个可编辑单元格。**每格必须是独立组件**——useCompositionField 不能在循环里调用
 * （同 StoryboardRow 存在的理由）。
 */
function EvaluationCellField({
  projectId,
  rowId,
  column,
  value,
  status,
  error,
  onRunCell,
}: {
  projectId: string
  rowId: string
  column: EvaluationColumn
  value: string
  status?: string
  error?: string
  onRunCell: (columnId: string, rowId: string) => void
}) {
  const patchEvaluationCell = useFlowStore((s) => s.patchEvaluationCell)
  const field = useCompositionField(value, (v) =>
    // 手改 LLM 格的结果视为定稿：清掉 error 与运行态标记，免得旁边一直挂着红叉
    patchEvaluationCell(
      projectId,
      rowId,
      column.id,
      column.kind === 'llm'
        ? { value: v, status: v ? 'done' : 'idle', error: undefined }
        : { value: v },
    ),
  )
  const isLlm = column.kind === 'llm'
  const busy = status === 'pending' || status === 'running'

  return (
    // 高度由 <tr> 的行高决定，这里撑满：内容超出就在格内滚动，不再把整行顶高
    <div className="relative flex h-full items-stretch">
      <textarea
        {...field}
        // 运行中禁止编辑：结果马上要被 worker 覆盖，让用户白输
        disabled={busy}
        rows={1}
        title={error || undefined}
        className={cn(
          'h-full w-full resize-none overflow-auto bg-transparent px-2 py-1.5 text-xs outline-none',
          'focus:bg-accent/40 disabled:opacity-60',
          isLlm && 'pr-6',
          status === 'error' && 'text-destructive',
        )}
      />
      {isLlm && (
        <div className="pointer-events-none absolute top-1 right-1 flex items-center gap-1">
          <CellStatusIcon status={status} />
        </div>
      )}
      {/* 单格生成/重跑：非运行态时 hover 该格才出现，免得每格都挂个按钮 */}
      {isLlm && !busy && (
        <button
          type="button"
          onClick={() => onRunCell(column.id, rowId)}
          title={
            status === 'done' || status === 'error' ? '重新评估这一格' : '评估这一格'
          }
          className="absolute right-1 bottom-1 hidden rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground group-hover/row:block"
        >
          {status === 'done' || status === 'error' ? (
            <RotateCcw className="size-3" />
          ) : (
            <Play className="size-3" />
          )}
        </button>
      )}
    </div>
  )
}

/** 列头：单击列名内联改名 + 右侧列菜单。 */
function ColumnHeader({
  column,
  running,
  onRename,
  onDelete,
  onEdit,
  onRun,
}: {
  column: EvaluationColumn
  running: boolean
  onRename: (name: string) => void
  onDelete: () => void
  onEdit: () => void
  onRun: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(column.name)
  const composingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== column.name) onRename(next)
    else setDraft(column.name)
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      {column.kind === 'llm' && (
        <Sparkles className="size-3 shrink-0 text-violet-600 dark:text-violet-400" />
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onCompositionStart={() => (composingRef.current = true)}
          onCompositionEnd={() => (composingRef.current = false)}
          onBlur={commit}
          onKeyDown={(e) => {
            // IME 组词中的回车是确认候选词，不能当提交
            if (composingRef.current) return
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(column.name)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-xs outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(column.name)
            setEditing(true)
          }}
          title="点击重命名"
          className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
        >
          {column.name || '（未命名）'}
        </button>
      )}
      {running && (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="列操作"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onSelect={() => {
              setDraft(column.name)
              setEditing(true)
            }}
          >
            重命名
          </DropdownMenuItem>
          {column.kind === 'llm' && (
            <>
              <DropdownMenuItem onSelect={onEdit}>编辑评估 prompt</DropdownMenuItem>
              <DropdownMenuItem onSelect={onRun} disabled={running}>
                {running ? '评估中…' : '运行本列'}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            删除列
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Excel 式表格主体：sticky 表头 + 行号列 + 可编辑单元格。 */
export function EvaluationGrid({
  projectId,
  table,
  runningColumns,
  onAddRow,
  onDeleteRow,
  onRenameColumn,
  onResizeColumn,
  onResizeRow,
  onDeleteColumn,
  onEditLlmColumn,
  onRunColumn,
  onRunCell,
}: GridProps) {
  const { columns, rows } = table
  // 拖拽中的临时尺寸：只在本组件内实时反馈，松手才写 store（见 beginDrag 的注释）
  const [dragCol, setDragCol] = useState<{ id: string; width: number } | null>(null)
  const [dragRow, setDragRow] = useState<{ id: string; height: number } | null>(null)

  const widthOf = (col: EvaluationColumn) => {
    if (dragCol?.id === col.id) return dragCol.width
    return col.width === undefined
      ? EVALUATION_DEFAULT_COL_WIDTH
      : clampColumnWidth(col.width)
  }
  const heightOf = (row: EvaluationRow) =>
    dragRow?.id === row.id ? dragRow.height : rowHeightOf(table, row)
  // 表宽 = 行号列 + 各列 + 删除列。min-w-full 让窄表仍铺满容器，
  // 多出来的空间由末尾那根没定宽的 filler 列吃掉（table-layout:fixed 下未定宽的列分摊剩余）。
  const totalWidth =
    ROW_NUM_WIDTH + columns.reduce((sum, c) => sum + widthOf(c), 0) + ROW_ACT_WIDTH

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table
        className="min-w-full table-fixed border-collapse text-xs"
        style={{ width: totalWidth }}
      >
        <colgroup>
          <col style={{ width: ROW_NUM_WIDTH }} />
          {columns.map((col) => (
            <col key={col.id} style={{ width: widthOf(col) }} />
          ))}
          <col style={{ width: ROW_ACT_WIDTH }} />
          <col />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="border-r border-b px-2 py-1.5 text-center font-normal text-muted-foreground">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="relative border-r border-b p-0 text-left font-normal"
              >
                <ColumnHeader
                  column={col}
                  running={runningColumns.includes(col.id)}
                  onRename={(name) => onRenameColumn(col.id, name)}
                  onDelete={() => onDeleteColumn(col.id)}
                  onEdit={() => onEditLlmColumn(col)}
                  onRun={() => onRunColumn(col.id)}
                />
                {/* 列宽手柄：贴在列头右边界，双击重置回默认宽 */}
                <div
                  onPointerDown={(e) =>
                    beginDrag(e, {
                      axis: 'x',
                      start: widthOf(col),
                      clamp: clampColumnWidth,
                      onPreview: (w) => setDragCol({ id: col.id, width: w }),
                      onEnd: () => setDragCol(null),
                      onCommit: (w) => onResizeColumn(col.id, w),
                    })
                  }
                  onDoubleClick={() => onResizeColumn(col.id, undefined)}
                  title="拖动调整列宽（双击恢复默认）"
                  className="absolute top-0 -right-1 z-20 h-full w-2 cursor-col-resize hover:bg-primary/40"
                />
              </th>
            ))}
            <th className="border-b" />
            <th className="border-b" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const h = heightOf(row)
            return (
              <tr
                key={row.id}
                className="group/row hover:bg-accent/20"
                style={{ height: h }}
              >
                <td
                  className="relative border-r border-b text-center align-middle text-muted-foreground"
                  style={{ height: h }}
                >
                  {i + 1}
                  {/* 行高手柄：贴在行号格下边界，双击清除本行覆盖回落表级行高 */}
                  <div
                    onPointerDown={(e) =>
                      beginDrag(e, {
                        axis: 'y',
                        start: h,
                        clamp: (v) => clampRowHeight(v),
                        onPreview: (v) => setDragRow({ id: row.id, height: v }),
                        onEnd: () => setDragRow(null),
                        onCommit: (v) => onResizeRow(row.id, v),
                      })
                    }
                    onDoubleClick={() => onResizeRow(row.id, undefined)}
                    title="拖动调整行高（双击恢复默认）"
                    className="absolute -bottom-1 left-0 z-20 h-2 w-full cursor-row-resize hover:bg-primary/40"
                  />
                </td>
                {columns.map((col) => (
                  // 高度必须落在 <td> 上：只写在 <tr> 的话，格内那层 h-full 的百分比
                  // 没有参照物会塌成内容高度（行拉高了却只显示一小条）
                  <td
                    key={col.id}
                    className="border-r border-b p-0 align-top"
                    style={{ height: h }}
                  >
                    <EvaluationCellField
                      projectId={projectId}
                      rowId={row.id}
                      column={col}
                      value={cellValue(row, col.id)}
                      status={row.cells[col.id]?.status}
                      error={row.cells[col.id]?.error}
                      onRunCell={onRunCell}
                    />
                  </td>
                ))}
                <td className="border-b text-center align-middle">
                  <button
                    type="button"
                    onClick={() => onDeleteRow(row.id)}
                    title="删除本行"
                    className="hidden rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive group-hover/row:block"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </td>
                <td className="border-b" />
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddRow}
          className="text-muted-foreground"
        >
          <Plus className="size-3.5" />
          添加行
        </Button>
      </div>
    </div>
  )
}
