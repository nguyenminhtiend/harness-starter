import type {
  ApproveRunDeps,
  CancelRunDeps,
  DeleteConversationDeps,
  GetCapabilityDeps,
  GetConversationMessagesDeps,
  GetSettingsDeps,
  ListCapabilitiesDeps,
  ListConversationsDeps,
  Logger,
  ProviderKeys,
  ProviderResolver,
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
    GetConversationMessagesDeps,
    DeleteConversationDeps,
    GetSettingsDeps,
    UpdateSettingsDeps {
  readonly logger: Logger;
  readonly providerResolver: ProviderResolver;
  readonly providerKeys: ProviderKeys;
  readonly runAbortControllers: Map<string, AbortController>;
}
