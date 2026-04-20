import { Hono } from 'hono';
import { loadConfig, type ProviderKeys } from './config.ts';
import { type ApprovalStore, createApprovalStore } from './features/sessions/sessions.approval.ts';
import {
  createHitlSessionStore,
  type HitlSessionStore,
} from './features/sessions/sessions.hitl.ts';
import { createSessionsRoutes } from './features/sessions/sessions.routes.ts';
import type { SessionStore } from './features/sessions/sessions.store.ts';
import { createSessionStore } from './features/sessions/sessions.store.ts';
import { createSettingsRoutes } from './features/settings/settings.routes.ts';
import { createSettingsStore, type SettingsStore } from './features/settings/settings.store.ts';
import { createToolsRoutes } from './features/tools/tools.routes.ts';
import { createDatabase } from './infra/db.ts';
import { localCors } from './middleware/cors.ts';

export interface AppDeps {
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
  hitlSessionStore: HitlSessionStore;
  getProviderKeys: () => ProviderKeys;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use('/api/*', localCors());

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.get('/api/models', (c) => {
    const keys = deps.getProviderKeys();
    const models: Array<{ id: string; label: string; provider: string }> = [];

    if (keys.google) {
      models.push(
        { id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
        { id: 'google:gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
        { id: 'google:gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },
      );
    }

    if (keys.groq) {
      models.push(
        { id: 'groq:llama-3.3-70b-versatile', label: 'Llama 3.3 70B', provider: 'groq' },
        {
          id: 'groq:deepseek-r1-distill-llama-70b',
          label: 'DeepSeek R1 Distill 70B',
          provider: 'groq',
        },
        {
          id: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
          label: 'Llama 4 Scout 17B',
          provider: 'groq',
        },
        { id: 'groq:qwen-qwq-32b', label: 'Qwen QWQ 32B', provider: 'groq' },
        { id: 'groq:gemma2-9b-it', label: 'Gemma 2 9B', provider: 'groq' },
      );
    }

    if (keys.openrouter) {
      models.push(
        {
          id: 'openrouter:anthropic/claude-sonnet-4',
          label: 'Claude Sonnet 4',
          provider: 'openrouter',
        },
        {
          id: 'openrouter:openai/gpt-4.1',
          label: 'GPT-4.1',
          provider: 'openrouter',
        },
        {
          id: 'openrouter:openai/gpt-4.1-mini',
          label: 'GPT-4.1 Mini',
          provider: 'openrouter',
        },
        {
          id: 'openrouter:google/gemini-2.5-flash',
          label: 'Gemini 2.5 Flash (OR)',
          provider: 'openrouter',
        },
      );
    }

    return c.json({ models });
  });

  app.route(
    '/api/sessions',
    createSessionsRoutes({
      sessionStore: deps.sessionStore,
      settingsStore: deps.settingsStore,
      approvalStore: deps.approvalStore,
      hitlSessionStore: deps.hitlSessionStore,
      getProviderKeys: deps.getProviderKeys,
    }),
  );
  app.route('/api/tools', createToolsRoutes());
  app.route('/api/settings', createSettingsRoutes(deps.settingsStore));

  return app;
}

if (import.meta.main) {
  const config = loadConfig();
  const db = createDatabase(config.DATA_DIR);

  const providers = Object.keys(config.providerKeys).join(', ') || 'none';
  console.log(`[server] providers: ${providers}`);

  const app = createApp({
    sessionStore: createSessionStore(db),
    settingsStore: createSettingsStore(db),
    getProviderKeys: () => config.providerKeys,
    approvalStore: createApprovalStore(),
    hitlSessionStore: createHitlSessionStore(),
  });

  console.log(`[server] listening on http://${config.HOST}:${config.PORT}`);
  Bun.serve({
    fetch: app.fetch,
    hostname: config.HOST,
    port: config.PORT,
  });
}
