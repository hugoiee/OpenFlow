import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { useResizableWidth } from '@/hooks/useResizableWidth'
import { buildImageUpstream, buildLlmUpstream, buildVideoUpstream } from '@/lib/requestBody'
import {
  type ImageNode as ImageNodeT,
  type LlmNode as LlmNodeT,
  type Project,
  type VideoNode as VideoNodeT,
} from '@/lib/types'
import { useActiveProject } from '@/store/useFlowStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { ImageInput } from './ImageInput'
import { ImageParams } from './ImageParams'
import { LlmParams } from './LlmParams'
import { VideoParams } from './VideoParams'

/**
 * 右侧节点参数面板（Inspector）。
 * 仅在「恰好选中一个 image/video/llm 节点」时出现；节点卡片只显示生成结果，参数都在此编辑。
 * 选中状态来自 React Flow 写在 node.selected 上的标记（store 已通过 applyNodeChanges 维护）。
 */
export function NodeInspector() {
  const project = useActiveProject()
  if (!project) return null
  const selected = project.nodes.filter((n) => n.selected)
  if (selected.length !== 1) return null
  const node = selected[0]
  if (node.type !== 'image' && node.type !== 'video' && node.type !== 'llm') return null
  // key={node.id}：切换选中节点时重置内部状态（上传态 / 文件输入），避免串台
  return <NodeInspectorPanel key={node.id} node={node} project={project} />
}

/** 把 Agent 端点显示成 /chat/completions 上游地址（已带该后缀则原样）；空则给占位。 */
function chatCompletionsLabel(endpoint: string): string {
  const ep = endpoint.trim()
  if (!ep) return '…/chat/completions（后端默认端点）'
  const base = ep.replace(/\/+$/, '')
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
}

/**
 * 表格视图里单个字段值的渲染：数组逐行展开、嵌套对象转缩进键值块（应对上游 body 的
 * config / messages / 多模态内容块）、空数组显灰占位、布尔转 true/false、其余按文本换行。
 */
function RequestValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground/60">—</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground/60">[ 空 ]</span>
    return (
      <div className="flex flex-col gap-1">
        {value.map((item, i) => (
          <div key={i} className="min-w-0 break-all">
            <RequestValue value={item} />
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'object') {
    const rows = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    if (rows.length === 0) return <span className="text-muted-foreground/60">{'{ }'}</span>
    return (
      <div className="flex flex-col gap-0.5 rounded border border-border/50 bg-background/40 p-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-w-0 gap-1.5">
            <span className="shrink-0 font-medium text-muted-foreground">{k}</span>
            <div className="min-w-0 flex-1">
              <RequestValue value={v} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'boolean') return <span>{value ? 'true' : 'false'}</span>
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>
}

function NodeInspectorPanel({
  node,
  project,
}: {
  node: ImageNodeT | VideoNodeT | LlmNodeT
  project: Project
}) {
  const id = node.id
  // 面板宽度可调：当前设计宽度 240px 作为下限
  const { width, onPointerDownResize } = useResizableWidth('openflow-inspector-width', 240)
  // 上游端点 / 全局署名：预览「后端实际发往上游」的请求体需要它们（req_from 由全局署名注入）
  const reqFrom = useSettingsStore((s) => s.defaultReqFrom)
  const aigcEndpoint = useSettingsStore((s) => s.aigcEndpoint)
  const agentEndpoint = useSettingsStore((s) => s.agentEndpoint)
  // 「后端实际打到上游的请求体」：图像 / 视频=内网 AIGC 网关（req_from / model_name / config…），
  // LLM=OpenAI 兼容 /chat/completions（messages / 多模态内容块 / reasoning_effort）。与实发链路同源。
  const requestBody =
    node.type === 'image'
      ? buildImageUpstream(project, node, reqFrom)
      : node.type === 'video'
        ? buildVideoUpstream(project, node, reqFrom)
        : buildLlmUpstream(project, node)
  // 预览标签上的上游地址：图像 / 视频走 AIGC 端点，LLM 走 Agent 端点的 /chat/completions
  const upstreamEndpoint =
    node.type === 'llm'
      ? chatCompletionsLabel(agentEndpoint)
      : aigcEndpoint.trim() || '…/aigc（后端默认端点）'
  const requestJson = JSON.stringify(requestBody, null, 2)
  // 请求预览的显示方式：JSON / 表格（存 localStorage，跨节点/刷新保留）
  const [view, setView] = useState<'json' | 'table'>(() =>
    localStorage.getItem('openflow-request-view') === 'table' ? 'table' : 'json',
  )
  const pickView = (v: 'json' | 'table') => {
    setView(v)
    localStorage.setItem('openflow-request-view', v)
  }
  const entries = Object.entries(requestBody as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  )

  return (
    <aside
      style={{ width }}
      className="absolute right-0 top-0 z-10 flex h-full flex-col gap-3 overflow-y-auto border-l bg-background p-4"
    >
      {/* 左缘拖拽调宽 */}
      <div
        onPointerDown={onPointerDownResize}
        title="拖拽调整宽度"
        className="absolute left-0 top-0 z-30 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{node.data.label}</span>
        <h2 className="text-sm font-semibold">{node.data.model}</h2>
      </div>

      {/* 图像：输入图（画廊态）+ 模型参数；视频：整套参数；LLM：Model/Temperature/Thinking */}
      {node.type === 'image' ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-muted-foreground">输入图（来自连线）</span>
            <ImageInput id={id} imagesText={node.data.imagesText ?? ''} />
          </div>
          <ImageParams id={id} data={node.data} />
        </>
      ) : node.type === 'video' ? (
        <VideoParams id={id} data={node.data} />
      ) : (
        <LlmParams id={id} data={node.data} />
      )}

      {/* 请求预览（置底）：点击生成时真正发送的请求体，只读。JSON / 表格 两种查看方式可切换。 */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">请求（上游实发）</span>
            {/* 切换显示方式：JSON / 表格 */}
            <div className="flex shrink-0 rounded-md border p-0.5">
              {(['json', 'table'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => pickView(v)}
                  className={`rounded-sm px-2 py-0.5 text-[10px] transition-colors ${
                    view === v
                      ? 'bg-primary/10 font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v === 'json' ? 'JSON' : '表格'}
                </button>
              ))}
            </div>
          </div>
          {/* 实际打到的上游地址（署名 req_from 由后端从全局设置注入） */}
          <span className="break-all font-mono text-[10px] leading-snug text-muted-foreground/70">
            POST {upstreamEndpoint}
          </span>
        </div>

        {view === 'json' ? (
          <Textarea
            value={requestJson}
            readOnly
            // field-sizing-fixed 固定起始高度 + 内部滚动；resize-y 可拖拽调高；
            // 等宽字体 + cursor-default + bg-muted 表明这是只读的请求负载，仅供查看/复制。
            className="field-sizing-fixed h-72 max-h-[36rem] resize-y cursor-default whitespace-pre bg-muted/40 font-mono text-[11px] leading-relaxed"
          />
        ) : (
          <div className="overflow-hidden rounded-md border bg-muted/40 text-[11px]">
            <table className="w-full border-collapse">
              <tbody>
                {entries.map(([k, v]) => (
                  <tr key={k} className="border-b border-border/60 align-top last:border-b-0">
                    <td className="w-px whitespace-nowrap border-r border-border/60 px-2 py-1 font-medium text-muted-foreground">
                      {k}
                    </td>
                    <td className="px-2 py-1">
                      <RequestValue value={v} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  )
}
