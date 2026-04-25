import type { ModelEntry } from './types.ts';

export const knownModels: readonly ModelEntry[] = [
  { id: 'google:gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'google:gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'google:gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', provider: 'google' },

  { id: 'groq:llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B', provider: 'groq' },
  {
    id: 'groq:deepseek-r1-distill-llama-70b',
    displayName: 'DeepSeek R1 Distill 70B',
    provider: 'groq',
  },
  {
    id: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
    displayName: 'Llama 4 Scout 17B',
    provider: 'groq',
  },
  { id: 'groq:qwen-qwq-32b', displayName: 'Qwen QWQ 32B', provider: 'groq' },
  { id: 'groq:gemma2-9b-it', displayName: 'Gemma 2 9B', provider: 'groq' },

  {
    id: 'openrouter:anthropic/claude-sonnet-4',
    displayName: 'Claude Sonnet 4',
    provider: 'openrouter',
  },
  { id: 'openrouter:openai/gpt-4.1', displayName: 'GPT-4.1', provider: 'openrouter' },
  { id: 'openrouter:openai/gpt-4.1-mini', displayName: 'GPT-4.1 Mini', provider: 'openrouter' },
  {
    id: 'openrouter:google/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash (OR)',
    provider: 'openrouter',
  },

  { id: 'ollama:qwen2.5:3b', displayName: 'Qwen 2.5 3B (local)', provider: 'ollama' },
  { id: 'ollama:llama3.2:3b', displayName: 'Llama 3.2 3B (local)', provider: 'ollama' },
  { id: 'ollama:gemma3:4b', displayName: 'Gemma 3 4B (local)', provider: 'ollama' },
];
