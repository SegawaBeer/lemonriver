import { describe, expect, it } from 'vitest';
import { latestEntryFor, type TrashEntry } from './api';

const entry = (id: string, slideId: string, deletedAt: number): TrashEntry => ({
  id,
  slideId,
  title: slideId,
  folderId: null,
  deletedAt,
  expiresAt: deletedAt + 1,
});

describe('latestEntryFor', () => {
  it('picks the newest deletion of that deck', () => {
    const entries = [entry('a.1', 'a', 1), entry('b.9', 'b', 9), entry('a.5', 'a', 5)];
    expect(latestEntryFor(entries, 'a')?.id).toBe('a.5');
    expect(latestEntryFor(entries, 'c')).toBeNull();
  });
});
