import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { columnPlaceholder, type EvaluationColumn } from '@/lib/evaluation'
import { mergeModelOptions } from '@/lib/nodeCatalog'
import { useSettingsStore } from '@/store/useSettingsStore'

/** 「跟随全局设置」在 Select 里的哨兵值——Radix Select 不接受空串作为 item value。 */
const FOLLOW_GLOBAL = '__global__'

type Props = {
  open: boolean
  /** 编辑已有列时传入；新建传 null。 */
  column: EvaluationColumn | null
  /** 全部列（供插入 {{列名}} 占位符）。 */
  columns: EvaluationColumn[]
  onSubmit: (input: { name: string; prompt: string; model: string }) => void
  onClose: () => void
}

/**
 * 表单主体。**只在对话框打开时挂载、并以列 id 作 key**——表单初值直接走 useState 初始化器，
 * 就不必在 effect 里 setState 把 props 同步进 state（那是 react-hooks/set-state-in-effect 明令禁止的）。
 */
function LlmColumnForm({ column, columns, onSubmit, onClose }: Omit<Props, 'open'>) {
  const [name, setName] = useState(column?.name ?? '评估结果')
  const [prompt, setPrompt] = useState(column?.prompt ?? '')
  const [model, setModel] = useState(column?.model ?? '')
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const agentEndpoint = useSettingsStore((s) => s.agentEndpoint)
  const agentModelList = useSettingsStore((s) => s.agentModelList)
  const agentModels = useSettingsStore((s) => s.agentModels)
  const agentModelsLoaded = useSettingsStore((s) => s.agentModelsLoaded)
  const agentModelsLoading = useSettingsStore((s) => s.agentModelsLoading)
  const loadAgentModels = useSettingsStore((s) => s.loadAgentModels)
  // 候选与设置面板同源：手动维护的列表 ∪ 端点动态获取（当前已选值置顶保留）
  const modelOptions = mergeModelOptions(agentModelList, agentModels, model)

  // 列表尚未取过就拉一次（loaded 成败都置 true，故最多一次）；没配端点时不发请求
  useEffect(() => {
    if (agentEndpoint.trim() && !agentModelsLoaded && !agentModelsLoading)
      void loadAgentModels()
  }, [agentEndpoint, agentModelsLoaded, agentModelsLoading, loadAgentModels])

  /** 点列名把 {{列名}} 插到光标处（没有焦点则追加到末尾）。 */
  const insertPlaceholder = (columnName: string) => {
    const token = columnPlaceholder(columnName)
    const el = promptRef.current
    if (!el) {
      setPrompt((p) => p + token)
      return
    }
    const start = el.selectionStart ?? prompt.length
    const end = el.selectionEnd ?? prompt.length
    const next = prompt.slice(0, start) + token + prompt.slice(end)
    setPrompt(next)
    // 插完把光标放到 token 之后，方便接着写
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      window.alert('请填写列名')
      return
    }
    onSubmit({ name: trimmed, prompt, model })
  }

  // 可引用的列 = 除自己以外的所有列（自引用在展开时会原样保留，插了也没用）
  const referable = columns.filter((c) => c.id !== column?.id)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{column ? '编辑评估列' : '新建 LLM 评估列'}</DialogTitle>
        <DialogDescription>
          用 {'{{列名}}'} 引用同一行其他列的内容；运行本列时逐行调 LLM，把结果填进这一列。
        </DialogDescription>
      </DialogHeader>

      {/* 表单区独占中间那一行并自己滚动：撑高的内容不能把 DialogFooter 的按钮顶出视口 */}
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="evalColumnName">列名</Label>
          <Input
            id="evalColumnName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 情感评分"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="evalColumnPrompt">评估 prompt</Label>
          <Textarea
            id="evalColumnPrompt"
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              '如：请判断下面这段回答的质量，只输出 1-5 的分数。\n回答：{{回答}}'
            }
            rows={7}
            // shadcn 的 Textarea 基础类带 field-sizing-content（随内容自动增高），rows 只是初始高度、
            // 拦不住长 prompt；不封顶的话它能长到上千 px 把整个对话框撑爆，故这里补一个上限，
            // 超过就在文本域内部滚动。
            className="max-h-[45vh] font-mono text-xs"
          />
          {referable.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">插入引用：</span>
              {referable.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => insertPlaceholder(c.name)}
                  className="rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {columnPlaceholder(c.name)}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            引用了不存在的列名时占位符会原样保留（不会静默变成空），删列后记得回来改
            prompt。
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="evalColumnModel">模型</Label>
          <Select
            value={model || FOLLOW_GLOBAL}
            onValueChange={(v) => setModel(v === FOLLOW_GLOBAL ? '' : v)}
          >
            <SelectTrigger id="evalColumnModel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FOLLOW_GLOBAL}>跟随全局设置</SelectItem>
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            接口地址 / 密钥 / 协议始终取全局设置，这里只覆盖模型名。
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button onClick={submit}>{column ? '保存' : '创建'}</Button>
      </DialogFooter>
    </>
  )
}

/** 新建 / 编辑 LLM 评估列的对话框外壳（表单按列 id 重挂，见 LlmColumnForm 注释）。 */
export function LlmColumnDialog({ open, column, columns, onSubmit, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/*
        max-h + grid-rows 是成对的：DialogContent 是 grid 且 top-1/2 -translate-y-1/2 垂直居中，
        一旦内容高过视口就会**同时溢出上下两端**（标题和保存按钮一起看不见）。
        限高之后再把中间那行设成 1fr（表单区自己滚动），头尾两行 auto 始终留在框内。
      */}
      <DialogContent className="grid-rows-[auto_1fr_auto] max-h-[85vh] sm:max-w-xl">
        {open && (
          <LlmColumnForm
            key={column?.id ?? 'new'}
            column={column}
            columns={columns}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
