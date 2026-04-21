import type { ModelEntry, ProviderKeys } from './types.ts';

export const knownModels: readonly ModelEntry[] = [
  { id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'google:gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'google:gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },

  { id: 'groq:llama-3.3-70b-versatile', label: 'Llama 3.3 70B', provider: 'groq' },
  {
    id: 'groq:deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 Distill 70B',
    provider: 'groq',
  },
  {
    id: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B',
    provider: 'groq',
  },
  { id: 'groq:qwen-qwq-32b', label: 'Qwen QWQ 32B', provider: 'groq' },
  { id: 'groq:gemma2-9b-it', label: 'Gemma 2 9B', provider: 'groq' },

  {
    id: 'openrouter:anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'openrouter',
  },
  { id: 'openrouter:openai/gpt-4.1', label: 'GPT-4.1', provider: 'openrouter' },
  { id: 'openrouter:openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openrouter' },
  {
    id: 'openrouter:google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash (OR)',
    provider: 'openrouter',
  },

  { id: 'ollama:qwen2.5:3b', label: 'Qwen 2.5 3B (local)', provider: 'ollama' },
];

export function listAvailableModels(keys: ProviderKeys): ModelEntry[] {
  return knownModels.filter((m) => {
    if (m.provider === 'ollama') {
      return true;
    }
    return Boolean(keys[m.provider]);
  });
}
