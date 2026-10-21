type DisplayClock = {
  now(): number;
  foreground(): boolean;
  subscribe(listener: () => void): () => void;
  every(tick: () => void, milliseconds: number): () => void;
};

// Display refreshes never advance a timer. Each frame reads the current timestamp.
export function startDisplayClock(clock: DisplayClock, publish: (now: number) => void): () => void {
  let live = true;
  let stop: (() => void) | null = null;
  const tick = () => {
    if (live && clock.foreground()) publish(clock.now());
  };
  const reconcile = () => {
    stop?.();
    stop = null;
    if (!live || !clock.foreground()) return;
    tick();
    stop = clock.every(tick, 250);
  };
  const unsubscribe = clock.subscribe(reconcile);
  reconcile();
  return () => {
    live = false;
    stop?.();
    unsubscribe();
  };
}
