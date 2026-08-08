/**
 * Inspector 里的开关行：整行可点的边框按钮，右侧显示「开 / 关」。
 * 仓库没引 shadcn 的 Switch，播客与视频节点的布尔可调项都用这一件。
 */
export function ToggleRow({
  label,
  title,
  value,
  onChange,
}: {
  label: string
  title: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
        value
          ? 'border-primary bg-primary/10 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      <span>{label}</span>
      <span>{value ? '开' : '关'}</span>
    </button>
  )
}
