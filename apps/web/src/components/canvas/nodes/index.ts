import type { NodeTypes } from '@xyflow/react'
import { PromptNode } from './PromptNode'
import { LlmNode } from './LlmNode'
import { ImageNode } from './ImageNode'
import { SeedanceNode } from './SeedanceNode'
import { AssetNode } from './AssetNode'

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  llm: LlmNode,
  image: ImageNode,
  video: SeedanceNode,
  asset: AssetNode,
}
