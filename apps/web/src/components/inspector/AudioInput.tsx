import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { uploadFilesApi } from '@/lib/api'
import { collectUpstreamAudio } from '@/lib/graph'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'

/**
 * 输入音频编辑器（视频节点右侧 Inspector 用）。
 * 音频（audio_list）来自两处，合并成一条有序序列：
 *   - 上游连线传入的音频素材（只读，排前）
 *   - 本节点手动填/传的 URL（可删 / 排序，排后）
 * 上传走 uploadFilesApi(files, 'audio') → 后端 /api/upload-media。
 */
export function AudioInput({ id, audiosText }: { id: string; audiosText: string }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const project = useActiveProject()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // 手动填/传的 URL（按行拆，去空白 / 空行）
  const audios = audiosText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  // 上游连线传入的音频素材 URL（只读，排在手动之前）
  const connected = project ? collectUpstreamAudio(project, id) : []

  // 删除第 idx 段手动音频（连线音频只读，不在此列）
  const removeAudio = (idx: number) => {
    updateNodeData(id, { audiosText: audios.filter((_, i) => i !== idx).join('\n') })
  }

  // 在手动音频内部前移 / 后移（dir=-1 / 1），顺序即 audio_list 序号
  const moveAudio = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= audios.length) return
    const next = audios.slice()
    ;[next[idx], next[target]] = [next[target], next[idx]]
    updateNodeData(id, { audiosText: next.join('\n') })
  }

  // 选择本地音频 → 上传（走音频端点）→ 把返回 URL 追加进输入音频（保留已填内容）
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 清空，便于重复选同名文件
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls = await uploadFilesApi(files, 'audio')
      const next = [audiosText.trim(), ...urls].filter(Boolean).join('\n')
      updateNodeData(id, { audiosText: next })
    } catch (err) {
      window.alert(`音频上传失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const total = connected.length + audios.length

  return (
    <div className="flex flex-col gap-2">
      {total > 0 && (
        <div className="flex flex-col gap-1.5">
          {/* 上游连线传入：只读 */}
          {connected.map((url, i) => (
            <div
              key={`up-${url}-${i}`}
              className="flex items-center gap-2 rounded-md border border-primary/50 bg-muted p-1.5 ring-1 ring-primary/30"
            >
              <audio src={url} controls preload="none" className="nodrag h-8 min-w-0 flex-1" />
              <span className="shrink-0 rounded bg-primary/80 px-1 text-[9px] leading-4 text-primary-foreground">
                连线
              </span>
            </div>
          ))}

          {/* 手动填 / 传：可删 / 排序 */}
          {audios.map((url, i) => (
            <div key={`${url}-${i}`} className="flex items-center gap-2 rounded-md border bg-muted p-1.5">
              <audio src={url} controls preload="none" className="nodrag h-8 min-w-0 flex-1" />
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => moveAudio(i, -1)}
                  disabled={i === 0}
                  title="前移"
                  className="grid size-4 place-items-center rounded text-foreground transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronUp className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveAudio(i, 1)}
                  disabled={i === audios.length - 1}
                  title="后移"
                  className="grid size-4 place-items-center rounded text-foreground transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronDown className="size-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeAudio(i)}
                title="移除"
                className="grid size-5 shrink-0 place-items-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full"
      >
        {uploading ? '上传中…' : '上传音频'}
      </Button>
      <Textarea
        value={audiosText}
        onChange={(e) => updateNodeData(id, { audiosText: e.target.value })}
        placeholder="音频 URL（每行一个，可留空）"
        // field-sizing-fixed 关掉自动撑高；固定起始高度 + 内部滚动，resize-y 可拖高
        className="field-sizing-fixed h-16 max-h-72 resize-y text-xs"
      />
    </div>
  )
}
