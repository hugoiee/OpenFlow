import type { NodeTypes } from '@xyflow/react'
import { PromptNode } from './PromptNode'
import { ImageNode } from './ImageNode'
import { SeedanceNode } from './SeedanceNode'

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  video: SeedanceNode,
}
