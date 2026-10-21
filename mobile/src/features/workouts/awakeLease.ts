type WakeLock = { activate(tag: string): Promise<void>; deactivate(tag: string): Promise<void> };

// Each visible interval owns a distinct tag, including during rapid navigation.
export function awakeLease(api: WakeLock, tag: string, onError: () => void): () => void {
  let released = false;
  const release = () => api.deactivate(tag).catch(onError);
  void api.activate(tag).then(
    () => {
      if (released) void release();
    },
    () => {
      if (!released) onError();
    },
  );
  return () => {
    released = true;
    void release();
  };
}
