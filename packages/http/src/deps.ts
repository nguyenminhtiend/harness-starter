import type {
  ApproveRunDeps,
  CancelRunDeps,
  GetCapabilityDeps,
  GetSettingsDeps,
  ListCapabilitiesDeps,
  ListConversationsDeps,
  Logger,
  StartRunDeps,
  StreamRunEventsDeps,
  UpdateSettingsDeps,
} from '@harness/core';

export interface HttpAppDeps
  extends StartRunDeps,
    StreamRunEventsDeps,
    CancelRunDeps,
    ApproveRunDeps,
    ListCapabilitiesDeps,
    GetCapabilityDeps,
    ListConversationsDeps,
    GetSettingsDeps,
    UpdateSettingsDeps {
  readonly logger: Logger;
  readonly runAbortControllers: Map<string, AbortController>;
}
