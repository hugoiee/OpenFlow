import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/store/useSettingsStore'

/**
 * 启动强制填写 req_from：设置已加载且全局署名为空时，覆盖全屏的阻断弹窗，
 * 必须填写并保存后才放行；已填过（后端有值）则不出现。
 */
export function ReqFromGate({ children }: { children: React.ReactNode }) {
  const loaded = useSettingsStore((s) => s.loaded)
  const defaultReqFrom = useSettingsStore((s) => s.defaultReqFrom)
  const saveReqFrom = useSettingsStore((s) => s.saveReqFrom)

  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const needGate = loaded && !defaultReqFrom.trim()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    setSaving(true)
    setError('')
    try {
      await saveReqFrom(v)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {children}
      {needGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg"
          >
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-semibold">先填写你的署名</h2>
              <p className="text-sm text-muted-foreground">
                使用前请填写调用方署名 req_from，图像 / 视频生成与图片上传都会用到。
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gate-reqFrom">req_from（署名）</Label>
              <Input
                id="gate-reqFrom"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="改自己名字哦，不要冒用他/她人。"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <Button type="submit" disabled={saving || !value.trim()}>
              {saving ? '保存中…' : '开始使用'}
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
