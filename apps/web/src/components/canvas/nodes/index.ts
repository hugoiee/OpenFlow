import type { NodeTypes } from '@xyflow/react'
import { PromptNode } from './PromptNode'
import { GenerationNode } from './GenerationNode'

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  image: GenerationNode,
  video: GenerationNode,
}
