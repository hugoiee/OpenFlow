import { useRef, useState } from 'react'
import {
  ClipboardPaste,
  Copy,
  Download,
  Plus,
  Rows3,
  Sparkles,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  clampRowHeight,
  EVALUATION_MIN_ROW_HEIGHT,
  exportTableToXlsx,
  readXlsxFile,
  type EvaluationTable,
  matrixToTable,
  tableToTsv,
} from '@/lib/evaluation'
import { parseTsvTable } from '@/lib/tsv'

type Props = {
  table: EvaluationTable
  /** 项目名：作导出 xlsx 的文件名（每个项目导出的文件叫同一个名字，下载目录里没法分辨）。 */
  projectName: string
  feedback: string
  onFeedback: (text: string) => void
  onAddRow: () => void
  onAddDataColumn: () => void
  onAddLlmColumn: () => void
  /** 整表替换（导入/粘贴）；覆盖确认由调用方处理。 */
  onReplaceTable: (table: EvaluationTable, note: string) => void
  /** 全局默认行高（px）。 */
  onChangeRowHeight: (height: number) => void
}

/** 评估表工具栏：Excel 互通（导入/导出/复制/粘贴）+ 加行加列。 */
export function EvaluationToolbar({
  table,
  projectName,
  feedback,
  onFeedback,
  onAddRow,
  onAddDataColumn,
  onAddLlmColumn,
  onReplaceTable,
  onChangeRowHeight,
}: Props) {
  const rowHeight = clampRowHeight(table.rowHeight)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 「复制表格」：整表（含表头）以 TSV 写入剪贴板，直接粘进 Excel
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tableToTsv(table))
      onFeedback(`已复制 ${table.rows.length} 行（含表头），可直接粘进 Excel`)
    } catch {
      window.alert('复制失败：浏览器拒绝了剪贴板写入')
    }
  }

  // 「从 Excel 粘贴」：TSV 文本 → 重建整表（首行为列名）
  const handlePaste = (text: string) => {
    if (!text.trim()) return
    const matrix = parseTsvTable(text)
    if (matrix.length === 0) {
      window.alert('没解析出任何内容，请确认复制的是 Excel 单元格区域')
      return
    }
    onReplaceTable(matrixToTable(matrix), `已从剪贴板导入 ${matrix.length - 1} 行`)
    setPasteOpen(false)
  }

  const handleImportFile = async (file: File) => {
    setBusy(true)
    try {
      const matrix = await readXlsxFile(file)
      if (matrix.length === 0) {
        window.alert('这个文件里没读到数据（只支持第一个工作表）')
        return
      }
      onReplaceTable(
        matrixToTable(matrix),
        `已导入 ${matrix.length - 1} 行（${file.name}）`,
      )
    } catch (e) {
      window.alert(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    setBusy(true)
    try {
      await exportTableToXlsx(table, projectName.trim() || '评估表')
      onFeedback('已导出 xlsx')
    } catch (e) {
      window.alert(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onAddRow}>
          <Plus className="size-3.5" />
          添加行
        </Button>
        <Button variant="outline" size="sm" onClick={onAddDataColumn}>
          <Plus className="size-3.5" />
          添加数据列
        </Button>
        <Button variant="outline" size="sm" onClick={onAddLlmColumn}>
          <Sparkles className="size-3.5" />
          添加 LLM 评估列
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="从 .xlsx / .csv 文件导入（读第一个工作表，首行作列名）"
        >
          <Upload className="size-3.5" />
          导入 Excel
        </Button>
        <Button variant="ghost" size="sm" onClick={handleExport} disabled={busy}>
          <Download className="size-3.5" />
          导出 Excel
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          <Copy className="size-3.5" />
          复制表格
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPasteOpen((v) => !v)}>
          <ClipboardPaste className="size-3.5" />从 Excel 粘贴
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* 全局默认行高：只作用于「没单独拖过」的行，拖过的行保留自己的高度 */}
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title="所有未单独调整过的行的高度；单独拖过的行保持自己的高度不变"
        >
          <Rows3 className="size-3.5" />
          行高
          <input
            type="range"
            min={EVALUATION_MIN_ROW_HEIGHT}
            max={240}
            step={4}
            value={rowHeight}
            onChange={(e) => onChangeRowHeight(Number(e.target.value))}
            className="w-28 accent-primary"
          />
          <span className="w-9 tabular-nums">{rowHeight}px</span>
        </label>

        {feedback && (
          <span className="ml-1 text-xs text-muted-foreground">{feedback}</span>
        )}
      </div>

      {/* 粘贴接收区：永远空的受控输入，onPaste 拦下剪贴板文本自行解析（同分镜节点的做法） */}
      {pasteOpen && (
        <Textarea
          autoFocus
          value=""
          onChange={() => {}}
          onPaste={(e) => {
            e.preventDefault()
            handlePaste(e.clipboardData.getData('text/plain'))
          }}
          placeholder="在 Excel 里选中区域复制，然后在这里按 Ctrl/Cmd+V 粘贴（首行会作为列名）"
          rows={2}
          className="text-xs"
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // 清空 value：同一个文件连选两次也要能触发 change
          e.target.value = ''
          if (file) void handleImportFile(file)
        }}
      />
    </div>
  )
}
