type KeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Native IO can finish out of order. Reads, writes and removals of one key form one queue.
export function orderedKeyValue(storage: KeyValue): KeyValue {
  const tails = new Map<string, Promise<void>>();
  function enqueue<T>(key: string, action: () => Promise<T>): Promise<T> {
    const result = (tails.get(key) ?? Promise.resolve()).then(action);
    const tail = result.then(
      () => {},
      () => {},
    );
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  }
  return {
    getItem: (key) => enqueue(key, () => storage.getItem(key)),
    setItem: (key, value) => enqueue(key, () => storage.setItem(key, value)),
    removeItem: (key) => enqueue(key, () => storage.removeItem(key)),
  };
}
