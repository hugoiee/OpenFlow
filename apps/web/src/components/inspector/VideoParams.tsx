import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleRow } from '@/components/inspector/ToggleRow'
import { KlingShotsEditor } from '@/components/inspector/KlingShotsEditor'
import {
  KLING_QUALITY_DEFAULT,
  KLING_QUALITY_OPTIONS,
  VIDEO_DURATION_AUTO,
  VIDEO_RATIO_LABELS,
  VIDEO_VARIANT_DEFAULT,
  normalizeVideoDuration,
  normalizeVideoRatio,
  normalizeVideoResolution,
  videoDefaultVersion,
  videoHasFeature,
  videoModelSpec,
  videoVersionOptions,
} from '@/lib/nodeCatalog'
import { type GenerationNodeData } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/**
 * 视频节点参数控件（右侧 Inspector 用）：version / 分辨率 / 宽高比 / 时长 + 各模型特有可调项。
 * 所有取值范围都来自 videoModelSpec(模型, version) 这张能力表——切模型或换版本后，
 * 存下的旧值若超出新范围，这里显示的就是归一化后的合法值（与实发请求同一套归一化函数），
 * 不会出现「面板上选着 1080p、实际发的是 720p」这种偏差。
 * 输入图与音频由节点左侧端点连线决定（首尾帧 / 参考图两种变体），此处不涉及。
 */
export function VideoParams({ id, data }: { id: string; data: GenerationNodeData }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  const variant =
    data.videoVariant ?? (data.videoTask === 'reference' ? 'reference' : VIDEO_VARIANT_DEFAULT)
  const version = data.version ?? videoDefaultVersion(data.model)
  const spec = videoModelSpec(data.model, version)

  const hasResolution = spec.resolutions.length > 0
  const resolution = normalizeVideoResolution(spec, data.resolution)
  const ratio = normalizeVideoRatio(spec, data.ratio, variant)
  // 首尾帧被强制成固定比例（seedance 2.5 只支持 adaptive，输出跟随首帧图）→ 下拉锁死并说明原因
  const ratioForced = variant === 'frames' && Boolean(spec.framesRatio)
  const duration = normalizeVideoDuration(spec, data.duration)
  const durationAuto = duration === VIDEO_DURATION_AUTO

  const hasQualityMode = videoHasFeature(spec, 'qualityMode')

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        version
        <Select value={version} onValueChange={(v) => updateNodeData(id, { version: v })}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {videoVersionOptions(data.model).map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {/* 分辨率（可灵没有这项，用下面的质量档代替）+ 宽高比 并排 */}
      <div className="grid grid-cols-2 gap-2">
        {hasResolution && (
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            分辨率
            <Select value={resolution} onValueChange={(v) => updateNodeData(id, { resolution: v })}>
              <SelectTrigger className="w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spec.resolutions.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}

        <label
          className="flex flex-col gap-1 text-[11px] text-muted-foreground"
          title={ratioForced ? '该版本的首尾帧模式只支持自适应，输出宽高比跟随首帧图片' : undefined}
        >
          宽高比{ratioForced && <span className="text-[10px]">（首尾帧固定）</span>}
          <Select
            value={ratio}
            disabled={ratioForced}
            onValueChange={(v) => updateNodeData(id, { ratio: v })}
          >
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spec.ratios.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {VIDEO_RATIO_LABELS[r] ?? r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {hasQualityMode && (
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            生成质量
            <Select
              value={data.qualityMode || KLING_QUALITY_DEFAULT}
              onValueChange={(v) => updateNodeData(id, { qualityMode: v })}
            >
              <SelectTrigger className="w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KLING_QUALITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>时长（秒）</span>
          <span className="font-medium text-foreground">
            {durationAuto ? '自动' : `${duration}s`}
          </span>
        </div>
        <Slider
          value={[durationAuto ? spec.durationDefault : duration]}
          min={spec.durationMin}
          max={spec.durationMax}
          step={1}
          disabled={durationAuto}
          onValueChange={(vals) => updateNodeData(id, { duration: vals[0] })}
          className="py-1"
        />
        {spec.durationAuto && (
          <ToggleRow
            label="自动时长（由模型决定）"
            title="下发 config.duration = -1，让上游按内容自行决定时长"
            value={durationAuto}
            onChange={(v) =>
              updateNodeData(id, { duration: v ? VIDEO_DURATION_AUTO : spec.durationDefault })
            }
          />
        )}
      </div>

      {/* 模型特有的布尔可调项 */}
      {videoHasFeature(spec, 'generateAudio') && (
        <ToggleRow
          label="生成音频"
          title="config.generate_audio：让模型为画面配上音频"
          value={data.generateAudio ?? true}
          onChange={(v) => updateNodeData(id, { generateAudio: v })}
        />
      )}
      {videoHasFeature(spec, 'sound') && (
        <ToggleRow
          label="生成音效"
          title="config.sound：on / off"
          value={data.sound ?? true}
          onChange={(v) => updateNodeData(id, { sound: v })}
        />
      )}
      {videoHasFeature(spec, 'watermark') && (
        <ToggleRow
          label="AIGC 水印"
          title="config['aigc-watermark']：在生成结果上添加 AIGC 标识"
          value={data.watermark ?? false}
          onChange={(v) => updateNodeData(id, { watermark: v })}
        />
      )}

      {videoHasFeature(spec, 'multiShot') && (
        <KlingShotsEditor id={id} data={data} totalDuration={duration} />
      )}
    </div>
  )
}
