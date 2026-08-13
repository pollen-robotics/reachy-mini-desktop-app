/**
 * Coalesce concurrent calls for one shared resource into a single execution.
 *
 * A `useRef` guard cannot deduplicate work that belongs to the application
 * rather than to a component: each hook instance gets its own ref, so every
 * instance issues its own request. Hold the in-flight promise in a scope shared
 * by all callers instead, and hand the same promise to whoever asks while it is
 * still running.
 *
 * The gate reopens as soon as the task settles, so a later call starts fresh
 * work rather than reusing a stale result — this deduplicates, it does not
 * cache.
 */
export function createSingleFlight<T>(): (task: () => Promise<T>) => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return (task: () => Promise<T>): Promise<T> => {
    if (inFlight) {
      return inFlight;
    }

    // `task()` is invoked before the assignment so a synchronous throw
    // propagates to this caller without leaving a poisoned gate behind.
    const started = task();
    inFlight = started.finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
