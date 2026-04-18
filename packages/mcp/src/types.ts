export interface StdioConfig {
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HttpConfig {
  transport: 'http';
  url: string;
  headers?: Record<string, string>;
}

export type McpClientConfig = StdioConfig | HttpConfig;

export interface McpToolsOptions {
  allow?: string[];
  deny?: string[];
}
