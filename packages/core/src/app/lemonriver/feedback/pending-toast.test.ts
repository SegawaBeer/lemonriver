import { describe, expect, it } from 'vitest';
import { clearPendingToast, savePendingToast, takePendingToast } from './pending-toast';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('pending toast', () => {
  it('shows once after the reload', () => {
    const storage = memoryStorage();
    savePendingToast({ kind: 'trashed', slideId: 'alpha', name: 'Alpha' }, storage);
    expect(takePendingToast(storage)).toEqual({ kind: 'trashed', slideId: 'alpha', name: 'Alpha' });
    expect(takePendingToast(storage)).toBeNull();
  });

  it('is dropped when the request fails', () => {
    const storage = memoryStorage();
    savePendingToast({ kind: 'restored', slideId: 'alpha', name: 'Alpha' }, storage);
    clearPendingToast(storage);
    expect(takePendingToast(storage)).toBeNull();
  });

  it('ignores anything it did not write', () => {
    const storage = memoryStorage();
    storage.setItem('lemonriver:pending-toast', '{"kind":"trashed","name":"x"}');
    expect(takePendingToast(storage)).toBeNull();
    storage.setItem('lemonriver:pending-toast', 'not json');
    expect(takePendingToast(storage)).toBeNull();
  });
});
