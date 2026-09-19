import type { MemoryRecord } from '@/lib/storage/types';

export interface RetrievalOptions {
  maxEntries?: number;
  maxChars?: number;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}_-]+/u)
      .filter((item) => item.length > 2),
  );
}

function relevance(query: string, memory: MemoryRecord): number {
  const q = tokens(query);
  const m = tokens(`${memory.title} ${memory.body} ${memory.tags.join(' ')}`);
  let overlap = 0;
  for (const token of q) if (m.has(token)) overlap += 1;
  const pinBoost = memory.pinned ? 100 : 0;
  const recencyBoost = Math.max(0, 10 - (Date.now() - memory.updatedAt) / 86_400_000 / 30);
  return pinBoost + overlap * 10 + recencyBoost;
}

export function selectMemoryContext(
  query: string,
  memories: MemoryRecord[],
  options: RetrievalOptions = {},
): MemoryRecord[] {
  const maxEntries = options.maxEntries ?? 6;
  const maxChars = options.maxChars ?? 1800;
  const approved = memories.filter((memory) => memory.approved);
  const ranked = [...approved].sort((a, b) => relevance(query, b) - relevance(query, a));

  const selected: MemoryRecord[] = [];
  let chars = 0;
  for (const memory of ranked) {
    const cost = memory.title.length + memory.body.length + 20;
    if (selected.length >= maxEntries) break;
    if (chars + cost > maxChars && selected.length > 0) continue;
    selected.push(memory);
    chars += cost;
  }
  return selected;
}

export function formatMemoryContext(memories: MemoryRecord[]): string {
  return memories
    .map((memory) => `[${memory.type}] ${memory.title}: ${memory.body}`)
    .join('\n');
}
