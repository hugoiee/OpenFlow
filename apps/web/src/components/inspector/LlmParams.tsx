import { Brain } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  LLM_MODELS,
  LLM_MODEL_DEFAULT,
  LLM_TEMPERATURE_DEFAULT,
  LLM_TEMPERATURE_MAX,
  LLM_TEMPERATURE_MIN,
  LLM_TEMPERATURE_STEP,
} from '@/lib/nodeCatalog'
import { type LlmNodeData } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/** Any LLM 节点参数控件（右侧 Inspector 用）：Model 选择 / Temperature 滑块 / Thinking 开关。 */
export function LlmParams({ id, data }: { id: string; data: LlmNodeData }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  // 旧数据可能存了已不在列表里的模型，仍原样保留可选（下拉里追加一项）
  const model = data.model || LLM_MODEL_DEFAULT
  const models = (LLM_MODELS as readonly string[]).includes(model)
    ? LLM_MODELS
    : [model, ...LLM_MODELS]
  const temperature = data.temperature ?? LLM_TEMPERATURE_DEFAULT
  const thinking = data.thinking ?? false

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        Model
        <Select value={model} onValueChange={(v) => updateNodeData(id, { model: v })}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Temperature</span>
          <span className="font-medium text-foreground">{temperature.toFixed(1)}</span>
        </div>
        <Slider
          value={[temperature]}
          min={LLM_TEMPERATURE_MIN}
          max={LLM_TEMPERATURE_MAX}
          step={LLM_TEMPERATURE_STEP}
          onValueChange={(vals) => updateNodeData(id, { temperature: vals[0] })}
          className="py-1"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground">Thinking（思考）</span>
        <button
          type="button"
          title="开启后请求体带原生推理参数（reasoning_effort）；若网关不支持可关闭"
          onClick={() => updateNodeData(id, { thinking: !thinking })}
          className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
            thinking
              ? 'border-primary bg-primary/10 font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Brain className="size-3.5" />
            开启思考
          </span>
          <span>{thinking ? '开' : '关'}</span>
        </button>
      </div>
    </div>
  )
}
