import { deleteConversation, getConversationMessages, listConversations } from '@harness/core';
import { Hono } from 'hono';
import { openApi } from 'hono-zod-openapi';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';
import { ErrorResponse } from './runs.schemas.ts';

const Conversation = z.object({
  id: z.string(),
  capabilityId: z.string(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
});

const Message = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export function conversationsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get(
    '/',
    openApi({
      tags: ['conversations'],
      request: { query: z.object({ capabilityId: z.string().optional() }) },
      responses: { 200: z.array(Conversation) },
    }),
    async (c) => {
      const capabilityId = c.req.valid('query').capabilityId;
      const conversations = await listConversations(deps, capabilityId);
      return c.json(conversations);
    },
  );

  app.get(
    '/:id/messages',
    openApi({
      tags: ['conversations'],
      responses: { 200: z.array(Message), 404: ErrorResponse },
    }),
    async (c) => {
      const messages = await getConversationMessages(deps, c.req.param('id'));
      return c.json(messages);
    },
  );

  app.delete(
    '/:id',
    openApi({
      tags: ['conversations'],
      responses: {},
    }),
    async (c) => {
      await deleteConversation(deps, c.req.param('id'));
      return c.body(null, 204);
    },
  );

  return app;
}
