import { describe, it, expect } from 'vitest';
import { createSingleFlight } from '../singleFlight';

// The contract this encodes is the one the app store depends on: two hook
// instances asking for the catalog at the same moment must produce ONE request.
// Two concurrent `/api/apps/list-available` calls made the daemon serialise
// them, turning a ~3.5s route into ~6.8s and pushing it past the fetch timeout,
// which surfaced to users as "No internet connection".

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSingleFlight', () => {
  it('runs the task once for concurrent callers and gives them all the result', async () => {
    const gate = deferred<string>();
    let runs = 0;
    const singleFlight = createSingleFlight<string>();
    const task = () => {
      runs += 1;
      return gate.promise;
    };

    const a = singleFlight(task);
    const b = singleFlight(task);
    const c = singleFlight(task);

    expect(runs).toBe(1);

    gate.resolve('catalog');

    expect(await a).toBe('catalog');
    expect(await b).toBe('catalog');
    expect(await c).toBe('catalog');
    expect(runs).toBe(1);
  });

  it('hands concurrent callers the very same promise', () => {
    const gate = deferred<number>();
    const singleFlight = createSingleFlight<number>();
    const task = () => gate.promise;

    expect(singleFlight(task)).toBe(singleFlight(task));

    gate.resolve(1);
  });

  it('starts fresh work once the previous call has settled', async () => {
    let runs = 0;
    const singleFlight = createSingleFlight<number>();
    const task = () => {
      runs += 1;
      return Promise.resolve(runs);
    };

    expect(await singleFlight(task)).toBe(1);
    expect(await singleFlight(task)).toBe(2);
    expect(runs).toBe(2);
  });

  it('propagates a rejection to every concurrent caller', async () => {
    const gate = deferred<string>();
    const singleFlight = createSingleFlight<string>();
    const task = () => gate.promise;

    const a = singleFlight(task);
    const b = singleFlight(task);

    gate.reject(new Error('daemon unreachable'));

    await expect(a).rejects.toThrow('daemon unreachable');
    await expect(b).rejects.toThrow('daemon unreachable');
  });

  it('reopens the gate after a rejection instead of wedging shut', async () => {
    let runs = 0;
    const singleFlight = createSingleFlight<string>();
    const failing = () => {
      runs += 1;
      return Promise.reject(new Error('boom'));
    };

    await expect(singleFlight(failing)).rejects.toThrow('boom');
    await expect(singleFlight(failing)).rejects.toThrow('boom');

    expect(runs).toBe(2);
  });

  it('does not leave the gate closed when the task throws synchronously', async () => {
    const singleFlight = createSingleFlight<string>();

    expect(() =>
      singleFlight(() => {
        throw new Error('sync boom');
      })
    ).toThrow('sync boom');

    expect(await singleFlight(() => Promise.resolve('recovered'))).toBe('recovered');
  });
});
