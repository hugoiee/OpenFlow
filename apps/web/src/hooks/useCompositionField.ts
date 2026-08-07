import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CompositionEvent } from 'react'

type FieldEl = HTMLInputElement | HTMLTextAreaElement

// 输入停顿多久后才把本地值提交进 store。打字期间只更新本地 state（不触发全局
// store 更新 → 不重渲染整个画布/Inspector），停顿或失焦时一次性提交。
const COMMIT_DELAY = 300

/**
 * useCompositionField 的完整版：除可展开到输入框的 field 外，另暴露
 * 程序化写入通道 setValue（本地立即更新 + 立即提交，绕开防抖——如 @ 引用插入 token）
 * 与组词态查询 isComposing（供调用方判断是否处于 IME 组词，免于重复维护状态）。
 */
export function useCompositionFieldControls(value: string, commit: (next: string) => void) {
  const [local, setLocal] = useState(value)
  const composingRef = useRef(false)
  // 待提交的最新值（null = 无待提交）；commit 用 ref 持有最新回调，避免闭包过期
  const pendingRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  }, [commit])

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingRef.current !== null) {
      const v = pendingRef.current
      pendingRef.current = null
      commitRef.current(v)
    }
  }, [])

  const schedule = useCallback(
    (next: string) => {
      pendingRef.current = next
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        flush()
      }, COMMIT_DELAY)
    },
    [flush],
  )

  // 外部值变化时同步到本地；组词中或有待提交的本地编辑时不同步，避免回灌打断/覆盖输入。
  useEffect(() => {
    if (!composingRef.current && pendingRef.current === null) setLocal(value)
  }, [value])

  // 卸载时 flush 待提交值（节点已删除时 updateNodeData 找不到 id，自然 no-op）
  useEffect(() => flush, [flush])

  // 程序化写入：本地立即更新 + 立即提交（不等 300ms 防抖；如 @ 引用插入 token）
  const setValue = useCallback(
    (next: string) => {
      setLocal(next)
      pendingRef.current = next
      flush()
    },
    [flush],
  )

  const isComposing = useCallback(() => composingRef.current, [])

  return {
    field: {
      value: local,
      onChange: (e: ChangeEvent<FieldEl>) => {
        const next = e.target.value
        setLocal(next) // 本地永远同步 → 受控 value 始终等于 DOM，杜绝回灌打断
        if (!composingRef.current) schedule(next) // 非组词才安排提交
      },
      onCompositionStart: () => {
        composingRef.current = true
      },
      onCompositionEnd: (e: CompositionEvent<FieldEl>) => {
        composingRef.current = false
        schedule((e.target as FieldEl).value) // 组词结束，安排提交最终文本
      },
      onBlur: () => {
        flush() // 失焦立即提交，避免「刚输完就点生成」拿到旧值
      },
    },
    setValue,
    isComposing,
  }
}

/**
 * 让「受控 + 写外部 store」的文本输入兼容中文输入法（IME），并把提交防抖。
 *
 * 背景一（IME）：当 value 直接绑到 store（如节点 data），组词过程中每次按键都会触发 store 更新，
 * 新值回灌受控 value 会打断 composition —— 表现为「中文没输完就中断」。英文不走 composition 故正常。
 *
 * 背景二（性能）：store 每次更新都会生成新的 project 对象，画布（React Flow）、右侧
 * Inspector（含请求预览的图遍历 + JSON 序列化）等所有订阅方同帧重渲染——每键一次会严重掉帧。
 *
 * 方案：用本地 state 承接输入，value 始终与 DOM 同步；提交防抖 300ms（组词期间不提交，
 * compositionend / 失焦 / 卸载时 flush）；外部（非组词、无待提交值时）改了 value
 * （如「选用预设」替换文本）则同步回本地。
 *
 * 用法：
 *   const field = useCompositionField(data.text, (v) => updateNodeData(id, { text: v }))
 *   <Textarea {...field} placeholder="…" className="…" />
 *
 * 需要程序化插入文本 / 查询组词态时用 useCompositionFieldControls（本函数即其 .field）。
 */
export function useCompositionField(value: string, commit: (next: string) => void) {
  return useCompositionFieldControls(value, commit).field
}
