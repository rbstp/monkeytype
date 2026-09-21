import { describe, expect, it } from "vitest";
import { heatColors } from "../../src/ts/trainer/heat";
import { KeyStat, LayoutStats } from "../../src/ts/trainer/key-stats";

const theme = { sub: "#000000", error: "#ff0000" };

const stat = (overrides: Partial<KeyStat>): KeyStat => ({
  emaMs: 200,
  timed: 10,
  errRate: 0,
  total: 10,
  errors: 0,
  lastSeen: 0,
  ...overrides,
});

const stats: LayoutStats = {
  KeyA: stat({ emaMs: 100 }),
  KeyS: stat({ emaMs: 200 }),
  KeyD: stat({ emaMs: 300, errRate: 0.075, errors: 1 }),
  KeyF: stat({ emaMs: 400, errRate: 0.15, errors: 2 }),
  KeyG: stat({ emaMs: 500, errRate: 0.5, errors: 5 }),
  KeyH: stat({ emaMs: 5000, timed: 4, total: 4, errRate: 1 }),
  KeyJ: stat({ emaMs: 0, timed: 0, total: 10, errRate: 1, errors: 10 }),
};

describe("heatColors", () => {
  it("returns nothing when off", () => {
    expect(heatColors(stats, "off", theme)).toEqual({});
  });

  it("maps speed between the 20th and 80th percentile of the layout", () => {
    const colors = heatColors(stats, "speed", theme);
    expect(colors.KeyA).toBe("#000000");
    expect(colors.KeyS).toBe("#000000");
    expect(colors.KeyF).toBe("#ff0000");
    expect(colors.KeyG).toBe("#ff0000");
    expect(colors.KeyD).toBe("#800000");
    expect(colors.KeyH).toBeUndefined();
    expect(colors.KeyJ).toBeUndefined();
  });

  it("maps the error rate from 0 to 15%", () => {
    const colors = heatColors(stats, "errors", theme);
    expect(colors.KeyA).toBe("#000000");
    expect(colors.KeyD).toBe("#800000");
    expect(colors.KeyF).toBe("#ff0000");
    expect(colors.KeyG).toBe("#ff0000");
    expect(colors.KeyH).toBeUndefined();
    expect(colors.KeyJ).toBe("#ff0000");
  });

  it("tints every timed key alike while the layout has one speed", () => {
    const colors = heatColors(
      { KeyA: stat({ emaMs: 300 }), KeyS: stat({ emaMs: 300 }) },
      "speed",
      theme,
    );
    expect(colors).toEqual({ KeyA: "#000000", KeyS: "#000000" });
  });
});
