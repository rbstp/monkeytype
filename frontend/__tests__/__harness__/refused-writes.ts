import { vi } from "vitest";

/**
 * Runs `run` with every localStorage write refused, restoring the spy even
 * when an assertion throws: vi.restoreAllMocks does not undo a spy on jsdom's
 * storage proxy, so a leak would leave every later write in the file throwing.
 */
export function withRefusedWrites<T>(run: () => T): T {
  const setItem = vi
    .spyOn(window.localStorage, "setItem")
    .mockImplementation(() => {
      throw new Error("exceeded the quota");
    });
  try {
    return run();
  } finally {
    setItem.mockRestore();
  }
}

/** Runs `run` with the nth localStorage write refused and the rest let through. */
export function withOneRefusedWrite<T>(nth: number, run: () => T): T {
  const write = window.localStorage.setItem.bind(window.localStorage);
  let writes = 0;
  const setItem = vi
    .spyOn(window.localStorage, "setItem")
    .mockImplementation((key: string, value: string) => {
      writes++;
      if (writes === nth) throw new Error("exceeded the quota");
      write(key, value);
    });
  try {
    return run();
  } finally {
    setItem.mockRestore();
  }
}

/** Counts the localStorage writes `run` makes, letting them all through. */
export function countWrites<T>(run: () => T): { result: T; writes: string[] } {
  const write = window.localStorage.setItem.bind(window.localStorage);
  const writes: string[] = [];
  const setItem = vi
    .spyOn(window.localStorage, "setItem")
    .mockImplementation((key: string, value: string) => {
      writes.push(key);
      write(key, value);
    });
  try {
    return { result: run(), writes };
  } finally {
    setItem.mockRestore();
  }
}
