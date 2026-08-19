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
import { cellValue, type EvaluationColumn, type EvaluationTable } from '@/lib/evaluation'
import { cn } from '@/lib/utils'
import { useFlowStore } from '@/store/useFlowStore'

type GridProps = {
  projectId: string
  table: EvaluationTable
  /** 正在跑的 LLM 列 id：列头显示进度、禁用重复触发。 */
  runningColumns: string[]
  onAddRow: () => void
  onDeleteRow: (rowId: string) => void
  onRenameColumn: (columnId: string, name: string) => void
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
    <div className="relative flex min-h-9 items-stretch">
      <textarea
        {...field}
        // 运行中禁止编辑：结果马上要被 worker 覆盖，让用户白输
        disabled={busy}
        rows={1}
        title={error || undefined}
        className={cn(
          'field-sizing-content max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-xs outline-none',
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
  onDeleteColumn,
  onEditLlmColumn,
  onRunColumn,
  onRunCell,
}: GridProps) {
  const { columns, rows } = table

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-max min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="w-12 border-r border-b px-2 py-1.5 text-center font-normal text-muted-foreground">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="min-w-48 max-w-96 border-r border-b p-0 text-left font-normal"
              >
                <ColumnHeader
                  column={col}
                  running={runningColumns.includes(col.id)}
                  onRename={(name) => onRenameColumn(col.id, name)}
                  onDelete={() => onDeleteColumn(col.id)}
                  onEdit={() => onEditLlmColumn(col)}
                  onRun={() => onRunColumn(col.id)}
                />
              </th>
            ))}
            <th className="w-10 border-b" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className="group/row hover:bg-accent/20">
              <td className="border-r border-b text-center align-middle text-muted-foreground">
                {i + 1}
              </td>
              {columns.map((col) => (
                <td key={col.id} className="border-r border-b p-0 align-top">
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
            </tr>
          ))}
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
