import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  ANGLE_ROTATION_DEFAULT,
  ANGLE_ROTATION_MAX,
  ANGLE_ROTATION_MIN,
  ANGLE_TILT_DEFAULT,
  ANGLE_TILT_MAX,
  ANGLE_TILT_MIN,
  ANGLE_ZOOM_DEFAULT,
  ANGLE_ZOOM_OPTIONS,
  clampRotation,
  clampTilt,
  normalizeZoom,
  zoomLabel,
} from '@/lib/angle'
import { IMAGE_MODELS } from '@/lib/nodeCatalog'
import { buildAngleRequest } from '@/lib/requestBody'
import type { AngleNode } from '@/lib/types'
import { useActiveProject, useFlowStore, useGraphRev } from '@/store/useFlowStore'
import { CameraOrbit } from './CameraOrbit'
import { ImageParams } from './ImageParams'

/** 滑杆行（照 PodcastParams 的 SliderRow 样板，多一个 display 自定义右侧值显示）。 */
function AngleSliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{display ?? String(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0] ?? value)}
        className="py-1"
      />
    </div>
  )
}

/**
 * 多角度节点参数（右侧 Inspector 用）：摄像头轨道控件 + 旋转/倾斜/缩放三滑杆 + 复位 +
 * 模型选择 + 按模型两套的图像参数（复用 ImageParams）。全部直写 store（同 ImageParams 惯例）。
 */
export function AngleParams({ node }: { node: AngleNode }) {
  const id = node.id
  const d = node.data
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const project = useActiveProject()
  // ⚡ 依赖取 graphRev 而非 project 引用（理由见 useFlowStore 里 graphRev 的注释）
  const graphRev = useGraphRev()
  // 轨道中心的源图 = 实际发送的那张（@ 指定 ?? 连线第一张），与请求预览同源
  const imageUrl = useMemo(
    () => (project ? buildAngleRequest(project, node).images[0] : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphRev, node.id, node.data],
  )

  const rotation = clampRotation(d.rotation)
  const tilt = clampTilt(d.tilt)
  const zoom = normalizeZoom(d.zoom)
  const zoomIndex = Math.max(
    0,
    ANGLE_ZOOM_OPTIONS.findIndex((o) => o.value === zoom),
  )
  const isDefaultView =
    rotation === ANGLE_ROTATION_DEFAULT && tilt === ANGLE_TILT_DEFAULT && zoom === ANGLE_ZOOM_DEFAULT

  return (
    <div className="flex flex-col gap-3">
      <CameraOrbit
        rotation={rotation}
        tilt={tilt}
        zoom={zoom}
        imageUrl={imageUrl}
        onChange={(next) => updateNodeData(id, next)}
      />
      <AngleSliderRow
        label="旋转"
        value={rotation}
        min={ANGLE_ROTATION_MIN}
        max={ANGLE_ROTATION_MAX}
        step={1}
        display={`${rotation}°`}
        onChange={(v) => updateNodeData(id, { rotation: clampRotation(v) })}
      />
      <AngleSliderRow
        label="倾斜"
        value={tilt}
        min={ANGLE_TILT_MIN}
        max={ANGLE_TILT_MAX}
        step={1}
        display={`${tilt}°`}
        onChange={(v) => updateNodeData(id, { tilt: clampTilt(v) })}
      />
      <AngleSliderRow
        label="缩放"
        value={zoomIndex}
        min={0}
        max={ANGLE_ZOOM_OPTIONS.length - 1}
        step={1}
        display={zoomLabel(zoom)}
        onChange={(v) =>
          updateNodeData(id, { zoom: (ANGLE_ZOOM_OPTIONS[v] ?? ANGLE_ZOOM_OPTIONS[1]).value })
        }
      />
      <Button
        variant="outline"
        size="sm"
        disabled={isDefaultView}
        onClick={() =>
          updateNodeData(id, {
            rotation: ANGLE_ROTATION_DEFAULT,
            tilt: ANGLE_TILT_DEFAULT,
            zoom: ANGLE_ZOOM_DEFAULT,
          })
        }
      >
        <RotateCcw className="size-3.5" /> 复位视角
      </Button>

      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        模型
        <Select value={d.model} onValueChange={(v) => updateNodeData(id, { model: v })}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_MODELS.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <ImageParams id={id} data={d} />
    </div>
  )
}
