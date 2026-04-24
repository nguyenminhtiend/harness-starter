export type {
  ApprovalDecision,
  ErrorShape,
  PendingApproval,
  RunFilter,
  RunSnapshot,
  RunStatus,
  SessionEvent,
  SessionEventType,
  TokenUsageDTO,
} from '@harness/core';

export interface CapabilityEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly supportsApproval: boolean;
}

export interface CapabilityDetail extends CapabilityEntry {
  readonly inputSchema: unknown;
  readonly settingsSchema: unknown;
}

export interface ModelEntry {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
}

export interface ConversationSummary {
  readonly conversationId: string;
  readonly capabilityId: string;
  readonly firstMessage: string;
  readonly messageCount: number;
  readonly lastActivityAt: string;
}

export interface ConversationMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly runId: string;
}

export interface SettingsResponse {
  readonly global: GlobalSettings;
  readonly capabilities: Record<string, CapabilitySettingsView>;
}

export interface GlobalSettings {
  readonly defaultModel: string;
  readonly budgetUsd: number;
  readonly budgetTokens: number;
  readonly concurrency: number;
}

export interface CapabilitySettingsView {
  readonly values: Record<string, unknown>;
  readonly inheritedFromGlobal: Record<string, boolean>;
}

export interface SettingsUpdateRequest {
  readonly scope: string;
  readonly settings: Record<string, unknown>;
}
