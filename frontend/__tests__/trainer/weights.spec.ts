import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { KeyStat, LayoutStats } from "../../src/ts/trainer/key-stats";
import { charWeights } from "../../src/ts/trainer/weights";

const qwerty = JSON.parse(
  readFileSync(
    `${import.meta.dirname}/../../static/layouts/qwerty.json`,
    "utf-8",
  ),
) as LayoutObject;

const stat = (overrides: Partial<KeyStat>): KeyStat => ({
  emaMs: 200,
  timed: 20,
  errRate: 0,
  total: 20,
  errors: 0,
  lastSeen: 0,
  ...overrides,
});

describe("charWeights", () => {
  it("weighs errors and slowness above the layout median, 1 otherwise", () => {
    const stats: LayoutStats = {
      KeyA: stat({}),
      KeyS: stat({}),
      KeyD: stat({ errRate: 0.2, errors: 4 }),
      KeyF: stat({ emaMs: 400 }),
      KeyJ: stat({ emaMs: 2000 }),
      KeyK: stat({ emaMs: 100 }),
      KeyL: stat({ total: 4, timed: 4, errRate: 1, emaMs: 5000 }),
    };
    const weights = charWeights(stats, qwerty);
    expect(weights["a"]).toBe(1);
    expect(weights["d"]).toBe(2);
    expect(weights["f"]).toBe(2);
    expect(weights["j"]).toBe(3);
    expect(weights["k"]).toBe(1);
    expect(weights["l"]).toBeUndefined();
    expect(weights["e"]).toBeUndefined();
    expect(weights["A"]).toBe(1);
    expect(weights["D"]).toBe(2);
    expect(weights[" "]).toBeUndefined();
  });

  it("adds nothing for speed while no key has five timed samples", () => {
    const weights = charWeights(
      { KeyA: stat({ timed: 4, emaMs: 900 }), KeyS: stat({ timed: 4 }) },
      qwerty,
    );
    expect(weights["a"]).toBe(1);
    expect(weights["s"]).toBe(1);
  });

  it("returns nothing for empty stats", () => {
    expect(charWeights({}, qwerty)).toEqual({});
  });
});
