import type { ZodType } from 'zod';

export function parseModelJson<T>(raw: string, schema: ZodType<T>): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = fenced?.[1] ?? raw;
  return schema.parse(JSON.parse(cleaned.trim()));
}

type TextPart = { type: 'text'; text: string };

export function messageTextContent(
  content: string | { type: string; [key: string]: unknown }[],
): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}
