import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useCompositionField } from '@/hooks/useCompositionField'
import {
  PODCAST_LANGUAGE_OPTIONS,
  PODCAST_LINE_GAP_DEFAULT,
  PODCAST_LINE_GAP_MAX,
  PODCAST_LINE_GAP_MIN,
  PODCAST_LOUDNESS_DEFAULT,
  PODCAST_LOUDNESS_MAX,
  PODCAST_LOUDNESS_MIN,
  PODCAST_PITCH_DEFAULT,
  PODCAST_PITCH_MAX,
  PODCAST_PITCH_MIN,
  PODCAST_ROLE_A_DEFAULT,
  PODCAST_ROLE_B_DEFAULT,
  PODCAST_SAMPLE_RATE_DEFAULT,
  PODCAST_SAMPLE_RATE_OPTIONS,
  PODCAST_SPEECH_RATE_DEFAULT,
  PODCAST_SPEECH_RATE_MAX,
  PODCAST_SPEECH_RATE_MIN,
} from '@/lib/nodeCatalog'
import { type PodcastNodeData } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/** 单个角色的「角色名 + 火山音色 ID」输入组（音色 ID 从火山控制台 > 音色库复制）。 */
function RoleFields({
  title,
  name,
  namePlaceholder,
  voice,
  onName,
  onVoice,
}: {
  title: string
  name: string
  namePlaceholder: string
  voice: string
  onName: (v: string) => void
  onVoice: (v: string) => void
}) {
  const nameField = useCompositionField(name, onName)
  const voiceField = useCompositionField(voice, onVoice)
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-2">
      <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
      <Input {...nameField} placeholder={namePlaceholder} className="h-8 text-xs" />
      <Input
        {...voiceField}
        placeholder="音色 ID，如 zh_female_vv_uranus_bigtts"
        className="h-8 font-mono text-xs"
      />
    </div>
  )
}

/** 带数值显示的滑块行（音频参数共用）。 */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">
          {value}
          {unit ?? ''}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0])}
        className="py-1"
      />
    </div>
  )
}

/** 开关行（additions 文本处理项共用；样式对齐 LlmParams 的思考开关）。 */
function ToggleRow({
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

/**
 * 播客音频节点参数控件（右侧 Inspector 用）：
 * 角色（角色名 + 火山音色 ID）× 2 + 音频参数（采样率/语速/音量/音调/句间停顿）
 * + 文本处理（additions：括号/Markdown/Emoji 过滤 + 朗读语种）+ 语音指令（context_texts）。
 */
export function PodcastParams({ id, data }: { id: string; data: PodcastNodeData }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const speechRate = data.speechRate ?? PODCAST_SPEECH_RATE_DEFAULT
  const sampleRate = data.sampleRate ?? PODCAST_SAMPLE_RATE_DEFAULT
  const loudnessRate = data.loudnessRate ?? PODCAST_LOUDNESS_DEFAULT
  const pitch = data.pitch ?? PODCAST_PITCH_DEFAULT
  const lineGapMs = data.lineGapMs ?? PODCAST_LINE_GAP_DEFAULT
  const explicitLanguage = data.explicitLanguage ?? ''

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-muted-foreground">
          角色（脚本行首按角色名匹配；音色 ID 从火山控制台 &gt; 音色库复制）
        </span>
        <RoleFields
          title="角色 1"
          name={data.roleAName ?? ''}
          namePlaceholder={`角色名，如 ${PODCAST_ROLE_A_DEFAULT}`}
          voice={data.roleAVoice ?? ''}
          onName={(v) => updateNodeData(id, { roleAName: v })}
          onVoice={(v) => updateNodeData(id, { roleAVoice: v })}
        />
        <RoleFields
          title="角色 2"
          name={data.roleBName ?? ''}
          namePlaceholder={`角色名，如 ${PODCAST_ROLE_B_DEFAULT}`}
          voice={data.roleBVoice ?? ''}
          onName={(v) => updateNodeData(id, { roleBName: v })}
          onVoice={(v) => updateNodeData(id, { roleBVoice: v })}
        />
      </div>

      {/* 音频参数（audio_params + post_process + 本地句间停顿） */}
      <div className="flex flex-col gap-2 border-t pt-3">
        <span className="text-[11px] font-medium text-muted-foreground">音频参数</span>
        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span>采样率</span>
          <Select
            value={String(sampleRate)}
            onValueChange={(v) => updateNodeData(id, { sampleRate: Number(v) })}
          >
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PODCAST_SAMPLE_RATE_OPTIONS.map((r) => (
                <SelectItem key={r} value={String(r)} className="text-xs">
                  {r} Hz
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SliderRow
          label="语速（100=2 倍速，-50=0.5 倍速）"
          value={speechRate}
          min={PODCAST_SPEECH_RATE_MIN}
          max={PODCAST_SPEECH_RATE_MAX}
          step={5}
          onChange={(v) => updateNodeData(id, { speechRate: v })}
        />
        <SliderRow
          label="音量（100=2 倍，-50=0.5 倍）"
          value={loudnessRate}
          min={PODCAST_LOUDNESS_MIN}
          max={PODCAST_LOUDNESS_MAX}
          step={5}
          onChange={(v) => updateNodeData(id, { loudnessRate: v })}
        />
        <SliderRow
          label="音调"
          value={pitch}
          min={PODCAST_PITCH_MIN}
          max={PODCAST_PITCH_MAX}
          step={1}
          onChange={(v) => updateNodeData(id, { pitch: v })}
        />
        <SliderRow
          label="句间停顿（拼接时插入的静音）"
          value={lineGapMs}
          min={PODCAST_LINE_GAP_MIN}
          max={PODCAST_LINE_GAP_MAX}
          step={50}
          unit="ms"
          onChange={(v) => updateNodeData(id, { lineGapMs: v })}
        />
      </div>

      {/* 文本处理（additions） */}
      <div className="flex flex-col gap-2 border-t pt-3">
        <span className="text-[11px] font-medium text-muted-foreground">文本处理</span>
        <ToggleRow
          label="过滤括号内的内容"
          title="开启后括号（含【】等）内的舞台提示/注释不朗读（additions.max_length_to_filter_parenthesis=100）；注意 [轻笑] 等表演指令也会被过滤"
          value={data.filterParenthesis ?? false}
          onChange={(v) => updateNodeData(id, { filterParenthesis: v })}
        />
        <ToggleRow
          label="过滤 Markdown 语法"
          title="开启后解析并去除 Markdown（如 **你好** 朗读为 你好）；关闭则按原始字符朗读"
          value={data.disableMarkdownFilter ?? false}
          onChange={(v) => updateNodeData(id, { disableMarkdownFilter: v })}
        />
        <ToggleRow
          label="过滤 Emoji"
          title="开启后解析过滤 Emoji（additions.disable_emoji_filter）"
          value={data.disableEmojiFilter ?? false}
          onChange={(v) => updateNodeData(id, { disableEmojiFilter: v })}
        />
        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span>朗读语种（指定后仅朗读该语种内容）</span>
          <Select
            value={explicitLanguage || 'auto'}
            onValueChange={(v) => updateNodeData(id, { explicitLanguage: v === 'auto' ? '' : v })}
          >
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PODCAST_LANGUAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value || 'auto'} value={o.value || 'auto'} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* AIGC 水印（additions.aigc_watermark / aigc_metadata） */}
      <div className="flex flex-col gap-2 border-t pt-3">
        <span className="text-[11px] font-medium text-muted-foreground">AIGC 水印</span>
        <ToggleRow
          label="生成标识（结尾节奏音）"
          title="additions.aigc_watermark：在合成音频结尾添加节奏标识；注意逐句合成时每句结尾都会有"
          value={data.aigcWatermark ?? false}
          onChange={(v) => updateNodeData(id, { aigcWatermark: v })}
        />
        <ToggleRow
          label="meta 隐式水印"
          title="additions.aigc_metadata：在音频中嵌入不可听的元信息水印；开启后每句改按 wav 请求（pcm 不支持）"
          value={data.aigcMetaEnable ?? false}
          onChange={(v) => updateNodeData(id, { aigcMetaEnable: v })}
        />
        {(data.aigcMetaEnable ?? false) && (
          <div className="flex flex-col gap-1.5 rounded-md border p-2">
            <MetaField
              label="合成服务提供者（content_producer）"
              value={data.aigcMetaContentProducer ?? ''}
              onChange={(v) => updateNodeData(id, { aigcMetaContentProducer: v })}
            />
            <MetaField
              label="内容制作编号（produce_id）"
              value={data.aigcMetaProduceId ?? ''}
              onChange={(v) => updateNodeData(id, { aigcMetaProduceId: v })}
            />
            <MetaField
              label="内容传播提供者（content_propagator）"
              value={data.aigcMetaContentPropagator ?? ''}
              onChange={(v) => updateNodeData(id, { aigcMetaContentPropagator: v })}
            />
            <MetaField
              label="内容传播编号（propagate_id）"
              value={data.aigcMetaPropagateId ?? ''}
              onChange={(v) => updateNodeData(id, { aigcMetaPropagateId: v })}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** meta 水印的单个元信息小输入（标签 + 单行输入，留空不下发）。 */
function MetaField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const field = useCompositionField(value, onChange)
  return (
    <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
      <span>{label}</span>
      <Input {...field} placeholder="留空不下发" className="h-7 text-xs" />
    </div>
  )
}
