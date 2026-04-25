export function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return text.trim();
}
