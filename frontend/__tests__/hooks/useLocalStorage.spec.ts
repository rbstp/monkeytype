import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot } from "solid-js";
import { z } from "zod";
import { useLocalStorage } from "../../src/ts/hooks/useLocalStorage";

const key = "useLocalStorageSpec";
const schema = z.object({ count: z.number() });
const fallback = { count: 0 };

function stored(): unknown {
  return JSON.parse(localStorage.getItem(key) ?? "null");
}

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.removeItem(key);
  });

  it("starts from the fallback and writes what it is set to", () => {
    createRoot((dispose) => {
      const [value, setValue] = useLocalStorage({ key, schema, fallback });
      expect(value()).toEqual({ count: 0 });
      setValue({ count: 3 });
      expect(value()).toEqual({ count: 3 });
      expect(stored()).toEqual({ count: 3 });
      dispose();
    });
  });

  it("reads the stored value over the fallback", () => {
    localStorage.setItem(key, JSON.stringify({ count: 7 }));
    createRoot((dispose) => {
      const [value] = useLocalStorage({ key, schema, fallback });
      expect(value()).toEqual({ count: 7 });
      dispose();
    });
  });

  it("migrates a stored value the schema rejects", () => {
    localStorage.setItem(key, JSON.stringify({ count: "7" }));
    createRoot((dispose) => {
      const [value] = useLocalStorage({
        key,
        schema,
        fallback,
        migrate: (old) => ({ count: Number((old as { count: string }).count) }),
      });
      expect(value()).toEqual({ count: 7 });
      expect(stored()).toEqual({ count: 7 });
      dispose();
    });
  });

  it("keeps the value it had when the write is rejected", () => {
    createRoot((dispose) => {
      const [value, setValue] = useLocalStorage({ key, schema, fallback });
      setValue({ count: 2 });
      const setItem = vi
        .spyOn(window.localStorage, "setItem")
        .mockImplementation(() => {
          throw new Error("exceeded the quota");
        });
      let calls = 0;
      // the updater still runs, so a caller that collects inside it reports a
      // write that never landed
      setValue((previous) => {
        calls++;
        return { count: previous.count + 1 };
      });
      setItem.mockRestore();
      expect(calls).toBe(1);
      expect(value()).toEqual({ count: 2 });
      expect(stored()).toEqual({ count: 2 });
      dispose();
    });
  });

  it("resolves an updater exactly once", () => {
    createRoot((dispose) => {
      const [value, setValue] = useLocalStorage({ key, schema, fallback });
      let calls = 0;
      // callers collect into the updater and read what they collected once the
      // call returns, so a second resolve would count every write twice
      setValue((previous) => {
        calls++;
        return { count: previous.count + 1 };
      });
      expect(calls).toBe(1);
      expect(value()).toEqual({ count: 1 });
      expect(stored()).toEqual({ count: 1 });
      dispose();
    });
  });
});
