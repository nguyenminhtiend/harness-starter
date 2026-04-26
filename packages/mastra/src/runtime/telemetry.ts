/**
 * Placeholder telemetry config. @mastra/core@1.27.x uses the `observability`
 * field (requires @mastra/observability) rather than a top-level `telemetry`
 * key. This helper captures the intent; wire it up once @mastra/observability
 * is added to the project.
 */
export interface TelemetryConfig {
  serviceName: string;
  enabled: boolean;
}

export function defaultTelemetryConfig(serviceName: string): TelemetryConfig {
  return { serviceName, enabled: true };
}
