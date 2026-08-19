// 评估项目（Excel 式表格）的类型与纯函数。不依赖 React / store。
//
// 表格形状：列有两种——「数据列」由人填/从 Excel 导入，「LLM 评估列」由列上的 prompt 逐行调 LLM 产出。
// 行的单元格按**列 id** 索引（不是列序）：改列顺序、删中间列都不会让已填数据错位。

import { newId } from './id'
import { matrixToTsv } from './tsv'

/** 列类型：data=人工填写的数据列；llm=按 prompt 逐行调 LLM 产出的评估列。 */
export type EvaluationColumnKind = 'data' | 'llm'

/** LLM 单元格的运行态：pending/running 是纯前端瞬时态，载入时复位为 idle。 */
export type EvaluationCellStatus = 'idle' | 'pending' | 'running' | 'done' | 'error'

export type EvaluationColumn = {
  id: string
  name: string
  kind: EvaluationColumnKind
  /** LLM 列的评估提示词，内含 {{列名}} 占位符引用同一行其他列的值。 */
  prompt?: string
  /** LLM 列覆盖的模型名；空=跟随全局设置（同分镜节点 data.model 语义）。 */
  model?: string
}

export type EvaluationCell = {
  value: string
  /** 仅 LLM 列使用；数据列恒为空。 */
  status?: EvaluationCellStatus
  error?: string
}

/** 一行：cells 按列 id 索引（缺键=空单元格）。 */
export type EvaluationRow = {
  id: string
  cells: Record<string, EvaluationCell>
}

export type EvaluationTable = {
  columns: EvaluationColumn[]
  rows: EvaluationRow[]
}

/** 跑整列时的并发上限（与分镜扩写同档，别把网关打爆）。 */
export const EVALUATION_CONCURRENCY = 3

const DEFAULT_COLUMN_COUNT = 3
const DEFAULT_ROW_COUNT = 5

function newColumnId(): string {
  return newId('col_')
}

function newRowId(): string {
  return newId('row_')
}

/** 空行（不预置任何单元格，取值时按缺键兜底为空）。 */
export function createRow(): EvaluationRow {
  return { id: newRowId(), cells: {} }
}

export function createColumn(
  name: string,
  kind: EvaluationColumnKind = 'data',
): EvaluationColumn {
  return kind === 'llm'
    ? { id: newColumnId(), name, kind, prompt: '', model: '' }
    : { id: newColumnId(), name, kind }
}

/** 新建评估项目的初始表：3 个数据列 × 5 个空行，够直接开始粘数据。 */
export function createDefaultTable(): EvaluationTable {
  return {
    columns: Array.from({ length: DEFAULT_COLUMN_COUNT }, (_, i) =>
      createColumn(`列${i + 1}`),
    ),
    rows: Array.from({ length: DEFAULT_ROW_COUNT }, createRow),
  }
}

/** 取某行某列的值（缺键=空串）。 */
export function cellValue(row: EvaluationRow, columnId: string): string {
  return row.cells[columnId]?.value ?? ''
}

/**
 * 载入时清洗后端存的表格 JSON：形状不对就退回默认表，
 * 并把 pending/running 这类瞬时态复位为 idle（刷新页面后不该卡在「评估中…」；
 * done 的结果与 error 提示都是持久成果，保留）。
 */
export function normalizeEvaluationTable(raw: unknown): EvaluationTable {
  if (!raw || typeof raw !== 'object') return createDefaultTable()
  const source = raw as Partial<EvaluationTable>
  if (!Array.isArray(source.columns) || !Array.isArray(source.rows))
    return createDefaultTable()

  const columns: EvaluationColumn[] = []
  const seenIds = new Set<string>()
  for (const raw of source.columns) {
    if (!raw || typeof raw !== 'object') continue
    const col = raw as Partial<EvaluationColumn>
    // id 缺失/重复都会让 cells 的按 id 索引失效，补一个新的
    const id =
      typeof col.id === 'string' && col.id && !seenIds.has(col.id)
        ? col.id
        : newColumnId()
    seenIds.add(id)
    const kind: EvaluationColumnKind = col.kind === 'llm' ? 'llm' : 'data'
    const column: EvaluationColumn = {
      id,
      name: typeof col.name === 'string' ? col.name : '',
      kind,
    }
    if (kind === 'llm') {
      column.prompt = typeof col.prompt === 'string' ? col.prompt : ''
      column.model = typeof col.model === 'string' ? col.model : ''
    }
    columns.push(column)
  }

  const seenRowIds = new Set<string>()
  const rows: EvaluationRow[] = []
  for (const raw of source.rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Partial<EvaluationRow>
    const id =
      typeof row.id === 'string' && row.id && !seenRowIds.has(row.id)
        ? row.id
        : newRowId()
    seenRowIds.add(id)
    const cells: Record<string, EvaluationCell> = {}
    if (row.cells && typeof row.cells === 'object') {
      for (const [columnId, rawCell] of Object.entries(row.cells)) {
        if (!rawCell || typeof rawCell !== 'object') continue
        const cell = rawCell as Partial<EvaluationCell>
        const status = cell.status
        cells[columnId] = {
          value: typeof cell.value === 'string' ? cell.value : '',
          // 请求瞬时态复位：刷新/重开后没有在飞的请求了
          status: status === 'pending' || status === 'running' ? 'idle' : status,
          error: typeof cell.error === 'string' ? cell.error : undefined,
        }
      }
    }
    rows.push({ id, cells })
  }

  // 全空的表没法操作（连加列按钮的落点都没有），退回默认表
  if (columns.length === 0 && rows.length === 0) return createDefaultTable()
  return { columns, rows }
}

/** 占位符：{{列名}}，列名里不允许再出现花括号与换行。 */
const PLACEHOLDER_RE = /\{\{([^{}\n]+)\}\}/g

/** 生成引用某列的占位符文本，供 Dialog 里点列名插入。 */
export function columnPlaceholder(name: string): string {
  return `{{${name}}}`
}

/**
 * 把 LLM 列的 prompt 模板按某一行的数据展开。
 * - 单趟正则替换：单元格值里若恰好含 {{...}} 不会被二次展开（避免数据内容被当模板注入）。
 * - 未知列名、以及自引用（引用评估列自己）原样保留字面——宁可让用户在结果里看见没替换的占位符，
 *   也不要静默替换成空串让人以为模板生效了。
 */
export function buildRowPrompt(
  template: string,
  columns: EvaluationColumn[],
  row: EvaluationRow,
  selfColumnId: string,
): string {
  return template.replace(PLACEHOLDER_RE, (whole, rawName: string) => {
    const name = rawName.trim()
    const target = columns.find((c) => c.name.trim() === name)
    if (!target || target.id === selfColumnId) return whole
    return cellValue(row, target.id)
  })
}

/**
 * 重命名列时同步改写所有 LLM 列 prompt 里的 {{旧名}} → {{新名}}。
 * 不做这步的话，改个列名就会让所有引用它的评估列悄悄失效。
 */
export function renameColumnInPrompts(
  columns: EvaluationColumn[],
  oldName: string,
  newName: string,
): EvaluationColumn[] {
  const from = oldName.trim()
  const to = newName.trim()
  if (!from || from === to) return columns
  return columns.map((col) =>
    col.kind === 'llm' && col.prompt
      ? {
          ...col,
          prompt: col.prompt.replace(PLACEHOLDER_RE, (whole, rawName: string) =>
            rawName.trim() === from ? columnPlaceholder(to) : whole,
          ),
        }
      : col,
  )
}

/** 表格 → 单元格矩阵（首行为列名），供 TSV 复制与 xlsx 导出共用。 */
export function tableToMatrix(table: EvaluationTable): string[][] {
  const header = table.columns.map((c) => c.name)
  const body = table.rows.map((row) => table.columns.map((col) => cellValue(row, col.id)))
  return [header, ...body]
}

/** 表格 → TSV 文本（含表头），供「复制表格」直接粘回 Excel。 */
export function tableToTsv(table: EvaluationTable): string {
  return matrixToTsv(tableToMatrix(table))
}

/**
 * 单元格矩阵 → 表格（首行为列名，全部建为数据列）。
 * 列名为空补「列N」、重名追加 (2) 消歧——列名是占位符的唯一标识，重名会让 {{名}} 指向不确定的列。
 * 短行按列数补空串。
 */
export function matrixToTable(matrix: string[][]): EvaluationTable {
  const rowsIn = matrix.filter((r) => r.length > 0)
  if (rowsIn.length === 0) return createDefaultTable()

  const headerCells = rowsIn[0]
  const width = Math.max(...rowsIn.map((r) => r.length))
  const used = new Set<string>()
  const columns: EvaluationColumn[] = Array.from({ length: width }, (_, i) => {
    const base = (headerCells[i] ?? '').trim() || `列${i + 1}`
    let name = base
    let n = 2
    while (used.has(name)) name = `${base} (${n++})`
    used.add(name)
    return createColumn(name)
  })

  const rows: EvaluationRow[] = rowsIn.slice(1).map((cellsIn) => {
    const cells: Record<string, EvaluationCell> = {}
    columns.forEach((col, i) => {
      const value = cellsIn[i] ?? ''
      if (value !== '') cells[col.id] = { value }
    })
    return { id: newRowId(), cells }
  })

  // 只有表头没有数据行时给一行空的，否则表格看着像导入失败
  return { columns, rows: rows.length > 0 ? rows : [createRow()] }
}

// ---- Excel 文件（.xlsx）导入导出 ----
// 两个库都动态 import：画布项目用不到，别让所有人白背这份体积（Vite 会单独切一个 chunk）。

/** 单元格值 → 字符串（日期/数字/布尔都按 Excel 显示的样子取，表格里一律存文本）。 */
function cellToText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

/** 读 .xlsx 的第一个工作表为单元格矩阵（首行即表头，由调用方交给 matrixToTable）。 */
export async function readXlsxFile(file: File): Promise<string[][]> {
  // 走 /browser 子路径：两个库都没有根导出，且 node 版会把 fs 拖进浏览器包
  const { default: readXlsx } = await import('read-excel-file/browser')
  const sheets = await readXlsx(file)
  // 只取第一个工作表（多表场景本功能不支持，UI 上已注明）
  return (sheets[0]?.data ?? []).map((row) => row.map(cellToText))
}

/** 把表格导出为 .xlsx 下载（首行为列名，库内部自己做 Blob + 触发下载）。 */
export async function exportTableToXlsx(
  table: EvaluationTable,
  fileName: string,
): Promise<void> {
  const { default: writeXlsx } = await import('write-excel-file/browser')
  const [header, ...body] = tableToMatrix(table)
  // 每格一个对象；表头加粗，正文一律按字符串写——评分列不该被 Excel 擅自转成数字
  const data = [
    header.map((text) => ({ value: text, fontWeight: 'bold' as const, type: String })),
    ...body.map((row) => row.map((text) => ({ value: text, type: String }))),
  ]
  await writeXlsx(data).toFile(`${fileName}.xlsx`)
}
