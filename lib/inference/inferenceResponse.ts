export function requireNonBlankCompletion(value: string | undefined | null): string {
  const text = value?.trim() ?? '';
  if (!text) throw new Error('EMPTY_COMPLETION');
  return text;
}
