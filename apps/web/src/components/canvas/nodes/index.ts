import type { NodeTypes } from '@xyflow/react'
import { PromptNode } from './PromptNode'
import { ModelNode } from './ModelNode'

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  model: ModelNode,
}
