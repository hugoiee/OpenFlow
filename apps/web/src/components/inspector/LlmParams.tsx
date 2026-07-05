import { useEffect } from 'react'
import { Brain, Loader2, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  LLM_MODEL_DEFAULT,
  LLM_TEMPERATURE_DEFAULT,
  LLM_TEMPERATURE_MAX,
  LLM_TEMPERATURE_MIN,
  LLM_TEMPERATURE_STEP,
  mergeModelOptions,
} from '@/lib/nodeCatalog'
import { type LlmNodeData } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'
import { useSettingsStore } from '@/store/useSettingsStore'

/** Any LLM 节点参数控件（右侧 Inspector 用）：Model 选择 / Temperature 滑块 / Thinking 开关。 */
export function LlmParams({ id, data }: { id: string; data: LlmNodeData }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  // Model 候选 = 手动维护列表(持久) ∪ 端点动态获取列表(本次会话)；与设置面板共用同一份
  const agentModelList = useSettingsStore((s) => s.agentModelList)
  const agentModels = useSettingsStore((s) => s.agentModels)
  const agentModelsLoading = useSettingsStore((s) => s.agentModelsLoading)
  const agentModelsLoaded = useSettingsStore((s) => s.agentModelsLoaded)
  const loadAgentModels = useSettingsStore((s) => s.loadAgentModels)

  // 挂载时（及保存设置使列表失效后）自动按已存配置拉一次可用模型
  useEffect(() => {
    if (!agentModelsLoaded && !agentModelsLoading) void loadAgentModels()
  }, [agentModelsLoaded, agentModelsLoading, loadAgentModels])

  const model = data.model || LLM_MODEL_DEFAULT
  // 已选模型若不在并集里仍置顶保留（不静默改动节点已存模型）
  const options = mergeModelOptions(agentModelList, agentModels, model)
  const hasModels = options.length > 0
  const temperature = data.temperature ?? LLM_TEMPERATURE_DEFAULT
  const thinking = data.thinking ?? false

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Model</span>
          <button
            type="button"
            title="重新从 Agent 端点获取模型列表"
            onClick={() => void loadAgentModels()}
            disabled={agentModelsLoading}
            className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground disabled:opacity-50"
          >
            {agentModelsLoading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            刷新
          </button>
        </div>

        {hasModels ? (
          <Select value={model} onValueChange={(v) => updateNodeData(id, { model: v })}>
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          // 未能获取到模型列表（未配置端点 / 端点不支持 /models / 获取失败）：回退手填模型名
          <>
            <Input
              value={model}
              onChange={(e) => updateNodeData(id, { model: e.target.value })}
              placeholder="如 gpt-4o"
              className="h-8 text-xs"
            />
            <span className="text-[10px] text-muted-foreground/80">
              {agentModelsLoading
                ? '正在获取模型列表…'
                : '可直接手填模型名；或在设置里维护「模型列表」/ 配置可拉取 /models 的端点，下拉即可多选'}
            </span>
          </>
        )}
      </div>

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
