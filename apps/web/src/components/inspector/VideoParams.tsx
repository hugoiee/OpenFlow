import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_DURATION_OPTIONS,
  SEEDANCE_MODE_DEFAULT,
  SEEDANCE_MODE_OPTIONS,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_RESOLUTION_OPTIONS,
  SEEDANCE_VERSION_DEFAULT,
  SEEDANCE_VERSION_OPTIONS,
} from '@/lib/nodeCatalog'
import { type GenerationNodeData } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/** 视频节点（Seedance）参数控件（右侧 Inspector 用）：version/mode/分辨率/时长。 */
export function VideoParams({ id, data }: { id: string; data: GenerationNodeData }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  const version = data.version ?? SEEDANCE_VERSION_DEFAULT
  const mode = data.mode ?? SEEDANCE_MODE_DEFAULT
  const resolution = data.resolution ?? SEEDANCE_RESOLUTION_DEFAULT
  const duration = data.duration ?? SEEDANCE_DURATION_DEFAULT

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        version
        <Select value={version} onValueChange={(v) => updateNodeData(id, { version: v })}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEEDANCE_VERSION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        mode
        <Select value={mode} onValueChange={(v) => updateNodeData(id, { mode: v })}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEEDANCE_MODE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          分辨率
          <Select value={resolution} onValueChange={(v) => updateNodeData(id, { resolution: v })}>
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEEDANCE_RESOLUTION_OPTIONS.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          时长（秒）
          <Select
            value={String(duration)}
            onValueChange={(v) => updateNodeData(id, { duration: Number(v) })}
          >
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEEDANCE_DURATION_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)} className="text-xs">
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
    </div>
  )
}
