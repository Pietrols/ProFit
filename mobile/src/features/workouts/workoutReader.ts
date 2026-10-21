// One focused consumer's reads. Later requests and account changes supersede earlier results.
export function createWorkoutReader<T>({
  user,
  owner,
  load,
  publish,
  fail,
}: {
  user: string;
  owner: () => string | null;
  load: () => Promise<T>;
  publish: (value: T) => void;
  fail: (error: unknown) => void;
}) {
  let live = true;
  let version = 0;
  return {
    async refresh(): Promise<boolean> {
      const current = ++version;
      const valid = () => live && current === version && owner() === user;
      if (!valid()) return false;
      try {
        const value = await load();
        if (!valid()) return false;
        publish(value);
        return true;
      } catch (error) {
        if (valid()) fail(error);
        return false;
      }
    },
    dispose() {
      live = false;
      version += 1;
    },
  };
}
