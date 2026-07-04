import { Magnet, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react'
import {
  Panel,
  useReactFlow,
  useStore,
  useViewport,
  type PanelProps,
} from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

/**
 * 横向缩放滑块（参考 reactflow.dev/ui 的 zoom-slider）：− / 滑块 / + / 百分比(点击复位 100%) / 适配视图。
 * 作为 React Flow <Panel> 渲染；配色走应用语义 token，自动适配深色。
 */
export function ZoomSlider({
  className,
  orientation = 'horizontal',
  snapEnabled,
  onToggleSnap,
  minimapEnabled,
  onToggleMinimap,
  ...props
}: Omit<PanelProps, 'children'> & {
  orientation?: 'horizontal' | 'vertical'
  /** 节点吸附（snap-to-grid）是否开启；提供 onToggleSnap 时才渲染磁吸按钮。 */
  snapEnabled?: boolean
  onToggleSnap?: () => void
  /** 缩略图是否显示；提供 onToggleMinimap 时才渲染缩略图开关按钮。 */
  minimapEnabled?: boolean
  onToggleMinimap?: () => void
}) {
  const { zoom } = useViewport()
  const { zoomTo, zoomIn, zoomOut, fitView } = useReactFlow()
  const minZoom = useStore((state) => state.minZoom)
  const maxZoom = useStore((state) => state.maxZoom)

  return (
    <Panel
      className={cn(
        'flex items-center gap-1 rounded-md bg-background p-1 text-foreground shadow-sm ring-1 ring-border',
        orientation === 'horizontal' ? 'flex-row' : 'flex-col',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'flex items-center gap-1',
          orientation === 'horizontal' ? 'flex-row' : 'flex-col-reverse',
        )}
      >
        <Button variant="ghost" size="icon" onClick={() => zoomOut({ duration: 300 })}>
          <Minus className="h-4 w-4" />
        </Button>
        <Slider
          className={cn(orientation === 'horizontal' ? 'w-[140px]' : 'h-[140px]')}
          orientation={orientation}
          value={[zoom]}
          min={minZoom}
          max={maxZoom}
          step={0.01}
          onValueChange={(values) => zoomTo(values[0])}
        />
        <Button variant="ghost" size="icon" onClick={() => zoomIn({ duration: 300 })}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <Button
        className={cn(
          'tabular-nums',
          orientation === 'horizontal' ? 'w-14 min-w-14' : 'h-[40px] w-[40px]',
        )}
        variant="ghost"
        onClick={() => zoomTo(1, { duration: 300 })}
      >
        {(100 * zoom).toFixed(0)}%
      </Button>
      <Button variant="ghost" size="icon" onClick={() => fitView({ duration: 300 })}>
        <Maximize className="h-4 w-4" />
      </Button>
      {onToggleSnap && (
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={snapEnabled}
          title="网格吸附"
          onClick={onToggleSnap}
          className={cn(snapEnabled && 'bg-accent text-accent-foreground')}
        >
          <Magnet className="h-4 w-4" />
        </Button>
      )}
      {onToggleMinimap && (
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={minimapEnabled}
          title="缩略图"
          onClick={onToggleMinimap}
          className={cn(minimapEnabled && 'bg-accent text-accent-foreground')}
        >
          <MapIcon className="h-4 w-4" />
        </Button>
      )}
    </Panel>
  )
}
