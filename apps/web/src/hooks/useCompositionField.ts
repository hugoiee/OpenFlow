import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CompositionEvent } from 'react'

type FieldEl = HTMLInputElement | HTMLTextAreaElement

/**
 * 让「受控 + 每次输入都直接写外部 store」的文本输入兼容中文输入法（IME）。
 *
 * 背景：当 value 直接绑到 store（如节点 data），组词过程中每次按键都会触发 store 更新，
 * 新值回灌受控 value 会打断 composition —— 表现为「中文没输完就中断」。英文不走 composition 故正常。
 *
 * 方案：用本地 state 承接输入，value 始终与 DOM 同步（即使外部重渲染也不会回灌错值打断组词）；
 * 组词期间不写 store，compositionend 时再一次性提交；外部（非组词时）改了 value（如「选用预设」
 * 替换文本）则同步回本地。
 *
 * 用法：
 *   const field = useCompositionField(data.text, (v) => updateNodeData(id, { text: v }))
 *   <Textarea {...field} placeholder="…" className="…" />
 */
export function useCompositionField(value: string, commit: (next: string) => void) {
  const [local, setLocal] = useState(value)
  const composingRef = useRef(false)

  // 外部值变化时同步到本地；组词中不同步，避免打断 composition。
  useEffect(() => {
    if (!composingRef.current) setLocal(value)
  }, [value])

  return {
    value: local,
    onChange: (e: ChangeEvent<FieldEl>) => {
      const next = e.target.value
      setLocal(next) // 本地永远同步 → 受控 value 始终等于 DOM，杜绝回灌打断
      if (!composingRef.current) commit(next) // 非组词才写 store
    },
    onCompositionStart: () => {
      composingRef.current = true
    },
    onCompositionEnd: (e: CompositionEvent<FieldEl>) => {
      composingRef.current = false
      commit((e.target as FieldEl).value) // 组词结束，提交最终文本
    },
  }
}
