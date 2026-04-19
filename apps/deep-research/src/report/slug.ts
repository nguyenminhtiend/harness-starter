const MAX_LENGTH = 60;

export function slugify(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    return 'untitled';
  }

  if (slug.length <= MAX_LENGTH) {
    return slug;
  }

  const truncated = slug.slice(0, MAX_LENGTH);
  const lastHyphen = truncated.lastIndexOf('-');
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}
