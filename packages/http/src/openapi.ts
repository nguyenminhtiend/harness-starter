export interface OpenApiSpec {
  readonly openapi: string;
  readonly info: { readonly title: string; readonly version: string; readonly description: string };
  readonly paths: Record<string, Record<string, unknown>>;
}

const ErrorResponse = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['code', 'message'],
    },
  },
  required: ['error'],
} as const;

const RunSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    capabilityId: { type: 'string' },
    status: {
      type: 'string',
      enum: ['pending', 'running', 'suspended', 'completed', 'failed', 'cancelled'],
    },
    createdAt: { type: 'string', format: 'date-time' },
    startedAt: { type: 'string', format: 'date-time' },
    finishedAt: { type: 'string', format: 'date-time' },
    conversationId: { type: 'string', format: 'uuid' },
  },
  required: ['id', 'capabilityId', 'status', 'createdAt'],
} as const;

const CapabilitySummary = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    supportsApproval: { type: 'boolean' },
  },
  required: ['id', 'title', 'description', 'supportsApproval'],
} as const;

const CapabilityDetail = {
  type: 'object',
  properties: {
    ...CapabilitySummary.properties,
    inputSchema: {},
    settingsSchema: {},
  },
  required: [...CapabilitySummary.required, 'inputSchema', 'settingsSchema'],
} as const;

function jsonBody(schema: unknown, description?: string) {
  return {
    required: true,
    content: { 'application/json': { schema } },
    ...(description ? { description } : {}),
  };
}

function jsonResponse(schema: unknown, description: string) {
  return {
    description,
    content: { 'application/json': { schema } },
  };
}

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

export function buildOpenApiSpec(): OpenApiSpec {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Harness API',
      version: '0.0.1',
      description: 'Agentic AI platform API — runs, capabilities, conversations, settings.',
    },
    paths: {
      '/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Health check',
          tags: ['system'],
          responses: {
            '200': jsonResponse(
              { type: 'object', properties: { status: { type: 'string' } } },
              'OK',
            ),
          },
        },
      },

      '/capabilities': {
        get: {
          operationId: 'listCapabilities',
          summary: 'List available capabilities',
          tags: ['capabilities'],
          responses: {
            '200': jsonResponse(
              { type: 'array', items: CapabilitySummary },
              'List of capabilities',
            ),
          },
        },
      },

      '/capabilities/{id}': {
        get: {
          operationId: 'getCapability',
          summary: 'Get capability detail including schemas',
          tags: ['capabilities'],
          parameters: [idParam],
          responses: {
            '200': jsonResponse(CapabilityDetail, 'Capability detail'),
            '404': jsonResponse(ErrorResponse, 'Not found'),
          },
        },
      },

      '/runs': {
        get: {
          operationId: 'listRuns',
          summary: 'List runs with optional filters',
          tags: ['runs'],
          parameters: [
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['pending', 'running', 'suspended', 'completed', 'failed', 'cancelled'],
              },
            },
            { name: 'capabilityId', in: 'query', required: false, schema: { type: 'string' } },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 500 },
            },
          ],
          responses: {
            '200': jsonResponse(
              {
                type: 'object',
                properties: { runs: { type: 'array', items: RunSchema } },
                required: ['runs'],
              },
              'List of runs',
            ),
          },
        },
        post: {
          operationId: 'startRun',
          summary: 'Start a new capability run',
          tags: ['runs'],
          requestBody: jsonBody({
            type: 'object',
            properties: {
              capabilityId: { type: 'string', minLength: 1 },
              input: {},
              settings: {},
              conversationId: { type: 'string' },
            },
            required: ['capabilityId', 'input'],
          }),
          responses: {
            '201': jsonResponse(
              {
                type: 'object',
                properties: { runId: { type: 'string', format: 'uuid' } },
                required: ['runId'],
              },
              'Run created',
            ),
            '404': jsonResponse(ErrorResponse, 'Capability not found'),
          },
        },
      },

      '/runs/{id}': {
        get: {
          operationId: 'getRun',
          summary: 'Get run details',
          tags: ['runs'],
          parameters: [idParam],
          responses: {
            '200': jsonResponse(RunSchema, 'Run details'),
            '404': jsonResponse(ErrorResponse, 'Not found'),
          },
        },
        delete: {
          operationId: 'deleteRun',
          summary: 'Cancel and delete a run',
          tags: ['runs'],
          parameters: [idParam],
          responses: {
            '204': { description: 'Deleted' },
          },
        },
      },

      '/runs/{id}/cancel': {
        post: {
          operationId: 'cancelRun',
          summary: 'Cancel a running run',
          tags: ['runs'],
          parameters: [idParam],
          responses: {
            '200': jsonResponse(
              { type: 'object', properties: { ok: { type: 'boolean' } } },
              'Cancelled',
            ),
            '404': jsonResponse(ErrorResponse, 'Run not found or already finished'),
          },
        },
      },

      '/runs/{id}/events': {
        get: {
          operationId: 'streamRunEvents',
          summary: 'Stream run events via SSE',
          tags: ['runs'],
          parameters: [
            idParam,
            {
              name: 'Last-Event-ID',
              in: 'header',
              required: false,
              schema: { type: 'string' },
              description: 'Resume from this sequence number',
            },
          ],
          responses: {
            '200': {
              description: 'SSE event stream of SessionEvents',
              content: {
                'text/event-stream': {
                  schema: { type: 'string', description: 'SSE stream of session events' },
                },
              },
            },
          },
        },
      },

      '/runs/{id}/approve': {
        post: {
          operationId: 'approveRun',
          summary: 'Approve a pending HITL approval',
          tags: ['approvals'],
          parameters: [idParam],
          requestBody: jsonBody({
            type: 'object',
            properties: {
              approvalId: { type: 'string', minLength: 1 },
              editedPlan: {},
            },
            required: ['approvalId'],
          }),
          responses: {
            '200': jsonResponse(
              { type: 'object', properties: { ok: { type: 'boolean' } } },
              'Approved',
            ),
            '404': jsonResponse(ErrorResponse, 'Run or approval not found'),
            '409': jsonResponse(ErrorResponse, 'Approval already resolved'),
          },
        },
      },

      '/runs/{id}/reject': {
        post: {
          operationId: 'rejectRun',
          summary: 'Reject a pending HITL approval',
          tags: ['approvals'],
          parameters: [idParam],
          requestBody: jsonBody({
            type: 'object',
            properties: {
              approvalId: { type: 'string', minLength: 1 },
              reason: { type: 'string' },
            },
            required: ['approvalId'],
          }),
          responses: {
            '200': jsonResponse(
              { type: 'object', properties: { ok: { type: 'boolean' } } },
              'Rejected',
            ),
            '404': jsonResponse(ErrorResponse, 'Run or approval not found'),
            '409': jsonResponse(ErrorResponse, 'Approval already resolved'),
          },
        },
      },

      '/settings': {
        get: {
          operationId: 'getSettings',
          summary: 'Get settings for a scope',
          tags: ['settings'],
          parameters: [
            {
              name: 'scope',
              in: 'query',
              required: false,
              schema: { type: 'string', default: 'global' },
            },
          ],
          responses: {
            '200': jsonResponse(
              { type: 'object', additionalProperties: true },
              'Settings key-value map',
            ),
          },
        },
        put: {
          operationId: 'updateSettings',
          summary: 'Update settings for a scope',
          tags: ['settings'],
          requestBody: jsonBody({
            type: 'object',
            properties: {
              scope: { type: 'string', minLength: 1 },
              settings: { type: 'object', additionalProperties: true },
            },
            required: ['scope', 'settings'],
          }),
          responses: {
            '200': jsonResponse({ type: 'object', additionalProperties: true }, 'Updated settings'),
          },
        },
      },

      '/conversations': {
        get: {
          operationId: 'listConversations',
          summary: 'List conversations',
          tags: ['conversations'],
          parameters: [
            {
              name: 'capabilityId',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': jsonResponse(
              {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    capabilityId: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    lastActivityAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              'List of conversations',
            ),
          },
        },
      },

      '/conversations/{id}': {
        delete: {
          operationId: 'deleteConversation',
          summary: 'Delete a conversation and its runs',
          tags: ['conversations'],
          parameters: [idParam],
          responses: {
            '204': { description: 'Deleted' },
            '404': jsonResponse(ErrorResponse, 'Not found'),
          },
        },
      },

      '/conversations/{id}/messages': {
        get: {
          operationId: 'getConversationMessages',
          summary: 'Get messages rebuilt from run events',
          tags: ['conversations'],
          parameters: [idParam],
          responses: {
            '200': jsonResponse(
              {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string', enum: ['user', 'assistant'] },
                    content: { type: 'string' },
                  },
                  required: ['role', 'content'],
                },
              },
              'Conversation messages',
            ),
            '404': jsonResponse(ErrorResponse, 'Not found'),
          },
        },
      },

      '/models': {
        get: {
          operationId: 'listModels',
          summary: 'List available AI models',
          tags: ['models'],
          responses: {
            '200': jsonResponse(
              {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    provider: { type: 'string' },
                    displayName: { type: 'string' },
                  },
                  required: ['id', 'provider', 'displayName'],
                },
              },
              'List of models',
            ),
          },
        },
      },
    },
  };
}

const SCALAR_HTML = `<!doctype html>
<html>
<head>
  <title>Harness API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

export function getScalarHtml(): string {
  return SCALAR_HTML;
}
