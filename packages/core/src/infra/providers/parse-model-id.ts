export interface ParsedModelId {
  readonly provider: string;
  readonly model: string;
}

export function parseModelId(modelId: string): ParsedModelId {
  const idx = modelId.indexOf(':');
  if (idx === -1) {
    return { provider: modelId, model: modelId };
  }
  return { provider: modelId.slice(0, idx), model: modelId.slice(idx + 1) };
}
