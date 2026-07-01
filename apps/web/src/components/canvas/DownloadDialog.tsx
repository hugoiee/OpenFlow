import { useState } from 'react'
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
import { triggerDownload } from '@/lib/api'

export type DownloadTarget = {
  /** 生成结果的源 URL（跨域内网地址）。 */
  url: string
  /** 资源类型：决定扩展名兜底（image=png / video=mp4）。 */
  kind: 'image' | 'video'
  /** 预填的默认文件名（不含扩展名）。 */
  defaultName: string
}

/**
 * 对话框内的重命名表单。文件名 state 就地初始化为默认名；对话框关闭时会随
 * DialogContent 卸载，故每次打开都会重新回填默认名（无需 effect 同步）。
 */
function DownloadForm({
  target,
  onConfirm,
  onCancel,
}: {
  target: DownloadTarget
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(target.defaultName)
  const confirm = () => onConfirm(name.trim() || target.defaultName)

  return (
    <>
      <DialogHeader>
        <DialogTitle>下载文件</DialogTitle>
        <DialogDescription>
          输入文件名即可，扩展名（{target.kind === 'video' ? '.mp4 等' : '.png / .jpg 等'}
          ）会按文件类型自动添加。
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5 py-2">
        <Label htmlFor="downloadName">文件名</Label>
        <Input
          id="downloadName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
          }}
          placeholder="请输入文件名（不含扩展名）"
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={confirm}>下载</Button>
      </DialogFooter>
    </>
  )
}

/**
 * 下载 / 重命名对话框：受控 open + 目标资源。用户只改「文件名」，
 * 扩展名由后端按响应类型自动补齐。确认即经同源代理触发浏览器下载。
 */
export function DownloadDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: DownloadTarget | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {target && (
          <DownloadForm
            target={target}
            onConfirm={(name) => {
              triggerDownload(target.url, name, target.kind)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
