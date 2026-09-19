import { describe, expect, it } from 'vitest';
import { selectMemoryContext } from '@/lib/memory/retriever';
import type { MemoryRecord } from '@/lib/storage/types';

function memory(id: string, body: string, patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id,
    title: id,
    body,
    type: 'note',
    source: 'manual',
    approved: true,
    pinned: false,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe('memory retrieval', () => {
  it('excludes unapproved memory', () => {
    const result = selectMemoryContext('watch', [
      memory('approved', 'watch client'),
      memory('hidden', 'watch client', { approved: false }),
    ]);
    expect(result.map((item) => item.id)).toEqual(['approved']);
  });

  it('prioritizes pinned memory', () => {
    const result = selectMemoryContext('unrelated', [
      memory('normal', 'x'),
      memory('pinned', 'y', { pinned: true }),
    ]);
    expect(result[0]?.id).toBe('pinned');
  });

  it('respects entry bound', () => {
    const all = Array.from({ length: 10 }, (_, index) => memory(String(index), 'same content'));
    expect(selectMemoryContext('same', all, { maxEntries: 3 }).length).toBe(3);
  });
});
