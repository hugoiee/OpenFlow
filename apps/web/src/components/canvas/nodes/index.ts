import type { NodeTypes } from '@xyflow/react'
import { PromptNode } from './PromptNode'
import { ImageNode } from './ImageNode'
import { AngleNode } from './AngleNode'
import { SeedanceNode } from './SeedanceNode'
import { PodcastNode } from './PodcastNode'
import { AssetNode } from './AssetNode'
import { GroupNode } from './GroupNode'
import { SplitterNode } from './SplitterNode'
import { StoryboardNode } from './StoryboardNode'

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  angle: AngleNode,
  video: SeedanceNode,
  podcast: PodcastNode,
  asset: AssetNode,
  group: GroupNode,
  splitter: SplitterNode,
  storyboard: StoryboardNode,
}
