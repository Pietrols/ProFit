// Wraps an async task so overlapping calls share one run instead of starting several.
// Used for token refresh: two requests that both find the token expired must not both spend the
// same refresh token, because the second use would look like a stolen token and end the sign-in.
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () => {
    if (!running) {
      running = task().finally(() => {
        running = null;
      });
    }
    return running;
  };
}
