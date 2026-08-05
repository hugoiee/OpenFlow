import type { NodeTypes } from '@xyflow/react'
import { PromptNode } from './PromptNode'
import { LlmNode } from './LlmNode'
import { ImageNode } from './ImageNode'
import { SeedanceNode } from './SeedanceNode'
import { PodcastNode } from './PodcastNode'
import { AssetNode } from './AssetNode'
import { GroupNode } from './GroupNode'

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  llm: LlmNode,
  image: ImageNode,
  video: SeedanceNode,
  podcast: PodcastNode,
  asset: AssetNode,
  group: GroupNode,
}
