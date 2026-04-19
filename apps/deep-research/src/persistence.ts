import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Checkpointer, ConversationStore } from '@harness/agent';
import { inMemoryCheckpointer, inMemoryStore } from '@harness/agent';

export interface PersistenceResult {
  store: ConversationStore;
  checkpointer: Checkpointer;
  type: 'sqlite' | 'memory';
  close: () => void;
}

export interface PersistenceOpts {
  ephemeral?: boolean;
  dataDir?: string;
}

function inMemoryPersistence(): PersistenceResult {
  return {
    store: inMemoryStore(),
    checkpointer: inMemoryCheckpointer(),
    type: 'memory',
    close: () => {},
  };
}

export async function createPersistence(opts?: PersistenceOpts): Promise<PersistenceResult> {
  if (opts?.ephemeral) {
    return inMemoryPersistence();
  }

  try {
    const { sqliteStore, sqliteCheckpointer } = await import('@harness/memory-sqlite');
    const dir = opts?.dataDir ?? path.join(process.env.HOME ?? '.', '.deep-research');
    fs.mkdirSync(dir, { recursive: true });

    const store = sqliteStore({ path: path.join(dir, 'store.db') });
    const checkpointer = sqliteCheckpointer({ path: path.join(dir, 'checkpoints.db') });

    return {
      store,
      checkpointer,
      type: 'sqlite',
      close: () => {
        store.close();
        checkpointer.close();
      },
    };
  } catch {
    console.warn('[deep-research] @harness/memory-sqlite not available, using in-memory storage');
    return inMemoryPersistence();
  }
}
