import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'

export function FlowCanvas() {
  const project = useActiveProject()
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)

  if (!project) return null

  // 用 smoothstep 让连线横平竖直（直角折线）；兼容已存的旧连线
  const edges = project.edges.map((e) => (e.type ? e : { ...e, type: 'smoothstep' }))

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        // key 让切换项目时画布完全重挂载，避免残留视图状态
        key={project.id}
        nodes={project.nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}

export function FlowCanvasWithProvider() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  )
}
