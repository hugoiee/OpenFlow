// Excel（TSV）互通的通用原语：与具体表结构无关，脚本分镜表与评估项目表格共用。
// 单独成文件是因为两处都要用——留在 storyboard.ts 里就得跨模块引一个分镜专属文件。

/** TSV 字段转义：含制表符/换行/引号的字段用双引号包裹（Excel 粘贴时能还原多行单元格）。 */
export function escapeTsvField(v: string): string {
  return /[\t\n\r"]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
}

/** 单元格矩阵 → TSV 文本（每行一条、字段按需转义），供「复制表格」粘进 Excel。 */
export function matrixToTsv(matrix: string[][]): string {
  return matrix.map((row) => row.map(escapeTsvField).join('\t')).join('\n')
}

/** 解析 TSV 文本为单元格矩阵：支持双引号包裹的字段（内含换行/制表符/"" 转义），\r\n 兼容。 */
export function parseTsvTable(text: string): string[][] {
  const rows: string[][] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === '') inQuotes = true
    else if (ch === '\t') {
      cells.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cells.push(cell)
      rows.push(cells)
      cells = []
      cell = ''
    } else cell += ch
  }
  cells.push(cell)
  rows.push(cells)
  return rows.filter((r) => r.some((c) => c.trim()))
}
