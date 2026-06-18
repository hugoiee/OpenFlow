import { Button } from '@/components/ui/button'
import { useFlowStore } from '@/store/useFlowStore'

export function Toolbar() {
  const addNode = useFlowStore((s) => s.addNode)

  return (
    <div className="absolute left-12 top-3 z-10 flex gap-2 rounded-lg border bg-card/90 p-1.5 shadow-sm backdrop-blur">
      <Button size="sm" variant="outline" onClick={() => addNode('prompt')}>
        <span className="mr-1 size-2 rounded-full bg-sky-500" />
        Prompt 节点
      </Button>
      <Button size="sm" variant="outline" onClick={() => addNode('model')}>
        <span className="mr-1 size-2 rounded-full bg-violet-500" />
        Model 节点
      </Button>
    </div>
  )
}
