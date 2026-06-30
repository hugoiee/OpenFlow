import type { NodeTypes } from '@xyflow/react'
import { PromptNode } from './PromptNode'
import { ImageNode } from './ImageNode'
import { GenerationNode } from './GenerationNode'

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  video: GenerationNode,
}
