import { DefaultExporter, Observability } from '@mastra/observability';

export interface CreateObservabilityOptions {
  serviceName: string;
}

export function createObservability(opts: CreateObservabilityOptions): Observability {
  return new Observability({
    configs: {
      default: {
        serviceName: opts.serviceName,
        exporters: [new DefaultExporter()],
      },
    },
  });
}
