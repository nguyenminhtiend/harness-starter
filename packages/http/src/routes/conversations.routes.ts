import { deleteConversation, getConversationMessages, listConversations } from '@harness/core';
import { Hono } from 'hono';
import type { HttpAppDeps } from '../deps.ts';

export function conversationsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const capabilityId = c.req.query('capabilityId');
    const conversations = await listConversations(deps, capabilityId);
    return c.json(conversations);
  });

  app.get('/:id/messages', async (c) => {
    const messages = await getConversationMessages(deps, c.req.param('id'));
    return c.json(messages);
  });

  app.delete('/:id', async (c) => {
    await deleteConversation(deps, c.req.param('id'));
    return c.body(null, 204);
  });

  return app;
}
