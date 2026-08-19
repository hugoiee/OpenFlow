import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { agentEvaluateApi } from '@/lib/api'
import {
  EVALUATION_CONCURRENCY,
  buildRowPrompt,
  cellValue,
  createColumn,
  createRow,
  renameColumnInPrompts,
  type EvaluationColumn,
  type EvaluationTable,
} from '@/lib/evaluation'
import { useFlowStore } from '@/store/useFlowStore'
import { EvaluationGrid } from './EvaluationGrid'
import { EvaluationToolbar } from './EvaluationToolbar'
import { LlmColumnDialog } from './LlmColumnDialog'

/** 正在编辑的 LLM 列：null=对话框关闭，'new'=新建，否则为列 id。 */
type EditingColumn = { mode: 'new' } | { mode: 'edit'; column: EvaluationColumn } | null

/**
 * 评估项目工作区：整页 Excel 式表格。
 * 与画布不同，这里**不在 React Flow 内**，故 Radix 组件（Dialog/DropdownMenu/Select）可正常使用。
 */
export function EvaluationWorkspace({ projectId }: { projectId: string }) {
  const table = useFlowStore((s) => s.projects.find((p) => p.id === projectId)?.table) as
    | EvaluationTable
    | undefined
  const projectName = useFlowStore(
    (s) => s.projects.find((p) => p.id === projectId)?.name ?? '',
  )
  const updateEvaluationTable = useFlowStore((s) => s.updateEvaluationTable)
  const setEvaluationTable = useFlowStore((s) => s.setEvaluationTable)

  const [editing, setEditing] = useState<EditingColumn>(null)
  // 工具栏操作反馈（复制/导入结果，纯 UI 态）
  const [feedback, setFeedback] = useState('')
  /** 正在跑的 LLM 列 id 集合（列头按钮显示「评估中」并禁用重复触发）。 */
  const [runningColumns, setRunningColumns] = useState<string[]>([])

  // 卸载/切项目时中止全部在飞请求（被中断的格子由 runner 末尾的清扫复位为 idle）
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const columns = useMemo(() => table?.columns ?? [], [table])
  const rows = useMemo(() => table?.rows ?? [], [table])

  /**
   * 逐格并发 runner：worker 池共享游标，同时最多 EVALUATION_CONCURRENCY 格在请求。
   * 所有写入走 store 的 patchEvaluationCell（set 时刻按 rowId/columnId 定位改一格）——
   * 组件里整表回写会让并发完成的格子互相覆盖；按 id 而非下标定位则跑到一半删行也不会写错格。
   * prompt 在**发请求那一刻**从 store 现读最新表构建，跑列途中改了数据列也能用上新值。
   */
  const runCells = useCallback(
    async (column: EvaluationColumn, rowIds: string[]) => {
      if (rowIds.length === 0) return
      const template = column.prompt ?? ''
      if (!template.trim()) {
        window.alert('这一列还没写评估 prompt，请先在列菜单里「编辑评估 prompt」')
        return
      }
      const controller = new AbortController()
      abortRef.current = controller
      const store = () => useFlowStore.getState()
      const currentTable = () =>
        store().projects.find((p) => p.id === projectId)?.table as
          | EvaluationTable
          | undefined

      setRunningColumns((prev) =>
        prev.includes(column.id) ? prev : [...prev, column.id],
      )
      for (const rowId of rowIds) {
        store().patchEvaluationCell(projectId, rowId, column.id, {
          status: 'pending',
          error: undefined,
        })
      }

      let cursor = 0
      const worker = async () => {
        while (!controller.signal.aborted) {
          const my = cursor++
          if (my >= rowIds.length) return
          const rowId = rowIds[my]
          // 现读最新表：跑列期间用户改了引用列的数据，后面的行应当用上新值
          const snapshot = currentTable()
          const row = snapshot?.rows.find((r) => r.id === rowId)
          if (!row || !snapshot) continue
          store().patchEvaluationCell(projectId, rowId, column.id, { status: 'running' })
          try {
            const prompt = buildRowPrompt(template, snapshot.columns, row, column.id)
            const text = await agentEvaluateApi(
              { prompt, model: column.model ?? '' },
              controller.signal,
            )
            store().patchEvaluationCell(projectId, rowId, column.id, {
              value: text,
              status: 'done',
              error: undefined,
            })
          } catch (e) {
            // 中止是用户行为（卸载/切项目），不写错误
            if (controller.signal.aborted) return
            const message = e instanceof Error ? e.message : String(e)
            store().patchEvaluationCell(projectId, rowId, column.id, {
              status: 'error',
              error: message,
            })
            // 配置缺失对每一行都会同样失败，跑完整列只是白等：中止剩余行并提示一次
            if (message.includes('请在设置中填写')) {
              controller.abort()
              window.alert(`${message}（已中止本列剩余行）`)
              return
            }
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(EVALUATION_CONCURRENCY, rowIds.length) }, worker),
      )

      // 被中止的格子（还停在 pending/running）复位为 idle，避免僵尸态
      if (controller.signal.aborted) {
        const snapshot = currentTable()
        snapshot?.rows.forEach((row) => {
          const status = row.cells[column.id]?.status
          if (status === 'pending' || status === 'running') {
            store().patchEvaluationCell(projectId, row.id, column.id, { status: 'idle' })
          }
        })
      }
      setRunningColumns((prev) => prev.filter((cid) => cid !== column.id))
    },
    [projectId],
  )

  const handleRunColumn = useCallback(
    (columnId: string) => {
      const column = columns.find((c) => c.id === columnId)
      if (!column || rows.length === 0) return
      // 跳过数据列全空的行：新建的表默认带 5 个空行，不跳的话点一次「运行本列」
      // 就白烧几次 LLM 调用、还在结果列里填一堆没有输入的胡话
      const targets = rows.filter((row) =>
        columns.some((col) => col.kind === 'data' && cellValue(row, col.id).trim()),
      )
      if (targets.length === 0) {
        window.alert('表格里还没有数据（数据列都是空的），先填几行再运行')
        return
      }
      void runCells(
        column,
        targets.map((r) => r.id),
      )
    },
    [columns, rows, runCells],
  )

  const handleRunCell = useCallback(
    (columnId: string, rowId: string) => {
      const column = columns.find((c) => c.id === columnId)
      if (!column) return
      void runCells(column, [rowId])
    },
    [columns, runCells],
  )

  // ---- 表格结构操作（纯 updater 经 updateEvaluationTable 落库）----

  const handleAddRow = useCallback(() => {
    updateEvaluationTable(projectId, (t) => ({ ...t, rows: [...t.rows, createRow()] }))
  }, [projectId, updateEvaluationTable])

  const handleDeleteRow = useCallback(
    (rowId: string) => {
      updateEvaluationTable(projectId, (t) => ({
        ...t,
        rows: t.rows.filter((r) => r.id !== rowId),
      }))
    },
    [projectId, updateEvaluationTable],
  )

  const handleAddDataColumn = useCallback(() => {
    updateEvaluationTable(projectId, (t) => ({
      ...t,
      columns: [...t.columns, createColumn(`列${t.columns.length + 1}`)],
    }))
  }, [projectId, updateEvaluationTable])

  const handleRenameColumn = useCallback(
    (columnId: string, name: string) => {
      const next = name.trim()
      if (!next) return
      updateEvaluationTable(projectId, (t) => {
        const target = t.columns.find((c) => c.id === columnId)
        if (!target || target.name === next) return t
        // 先把所有 LLM 列 prompt 里的 {{旧名}} 改写成 {{新名}}，再改列名本身——
        // 不同步改写的话，改个列名就会让所有引用它的评估列悄悄失效
        const renamed = renameColumnInPrompts(t.columns, target.name, next)
        return {
          ...t,
          columns: renamed.map((c) => (c.id === columnId ? { ...c, name: next } : c)),
        }
      })
    },
    [projectId, updateEvaluationTable],
  )

  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      const column = columns.find((c) => c.id === columnId)
      if (!column) return
      if (!window.confirm(`删除列「${column.name}」？该列所有单元格内容会一并删除。`))
        return
      updateEvaluationTable(projectId, (t) => ({
        ...t,
        columns: t.columns.filter((c) => c.id !== columnId),
        // 行里该列的单元格一并清掉，免得残留数据随项目 JSON 一直存下去
        rows: t.rows.map((row) => {
          if (!(columnId in row.cells)) return row
          const cells = { ...row.cells }
          delete cells[columnId]
          return { ...row, cells }
        }),
      }))
    },
    [columns, projectId, updateEvaluationTable],
  )

  /** 新建/编辑 LLM 列的提交（对话框里点保存）。 */
  const handleSubmitLlmColumn = useCallback(
    (input: { name: string; prompt: string; model: string }) => {
      if (!editing) return
      if (editing.mode === 'new') {
        updateEvaluationTable(projectId, (t) => ({
          ...t,
          columns: [
            ...t.columns,
            {
              ...createColumn(input.name, 'llm'),
              prompt: input.prompt,
              model: input.model,
            },
          ],
        }))
      } else {
        const columnId = editing.column.id
        updateEvaluationTable(projectId, (t) => {
          const target = t.columns.find((c) => c.id === columnId)
          if (!target) return t
          const renamed = renameColumnInPrompts(t.columns, target.name, input.name)
          return {
            ...t,
            columns: renamed.map((c) =>
              c.id === columnId
                ? { ...c, name: input.name, prompt: input.prompt, model: input.model }
                : c,
            ),
          }
        })
      }
      setEditing(null)
    },
    [editing, projectId, updateEvaluationTable],
  )

  /** 整表替换（xlsx 导入 / 从 Excel 粘贴）：覆盖前确认，已有数据不该被静默冲掉。 */
  const handleReplaceTable = useCallback(
    (next: EvaluationTable, note: string) => {
      const hasContent = rows.some((row) =>
        Object.values(row.cells).some((c) => c.value.trim()),
      )
      if (hasContent && !window.confirm('导入会替换当前整张表格，确定继续？')) return
      setEvaluationTable(projectId, next)
      setFeedback(note)
    },
    [projectId, rows, setEvaluationTable],
  )

  if (!table) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <EvaluationToolbar
        table={table}
        projectName={projectName}
        feedback={feedback}
        onFeedback={setFeedback}
        onAddRow={handleAddRow}
        onAddDataColumn={handleAddDataColumn}
        onAddLlmColumn={() => setEditing({ mode: 'new' })}
        onReplaceTable={handleReplaceTable}
      />
      <EvaluationGrid
        projectId={projectId}
        table={table}
        runningColumns={runningColumns}
        onAddRow={handleAddRow}
        onDeleteRow={handleDeleteRow}
        onRenameColumn={handleRenameColumn}
        onDeleteColumn={handleDeleteColumn}
        onEditLlmColumn={(column) => setEditing({ mode: 'edit', column })}
        onRunColumn={handleRunColumn}
        onRunCell={handleRunCell}
      />
      <LlmColumnDialog
        open={editing !== null}
        column={editing?.mode === 'edit' ? editing.column : null}
        columns={columns}
        onSubmit={handleSubmitLlmColumn}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
