import type { MastraCompositeStore } from '@mastra/core/storage';
import type { MastraEmbeddingModel, MastraVector } from '@mastra/core/vector';
import { Memory } from '@mastra/memory';

export interface CreateDefaultMemoryOptions {
  storage?: MastraCompositeStore;
  vector?: MastraVector | false;
  embedder?: MastraEmbeddingModel<string> | string;
}

const DEFAULT_WORKING_MEMORY_TEMPLATE = `# User Profile
- **Name**:
- **Timezone**:
- **Preferred Tone**: (casual | formal | technical)
- **Known Topics**:
`;

export function createDefaultMemory(opts?: CreateDefaultMemoryOptions): Memory {
  const hasVector = opts?.vector !== undefined && opts.vector !== false;
  return new Memory({
    ...(opts?.storage ? { storage: opts.storage } : {}),
    ...(hasVector ? { vector: opts.vector as MastraVector } : {}),
    ...(opts?.embedder ? { embedder: opts.embedder } : {}),
    options: {
      lastMessages: 20,
      semanticRecall: hasVector ? { topK: 5, messageRange: { before: 2, after: 1 } } : false,
      workingMemory: {
        enabled: true,
        scope: 'resource',
        template: DEFAULT_WORKING_MEMORY_TEMPLATE,
      },
      observationalMemory: true,
    },
  });
}
