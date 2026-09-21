import { beforeEach, describe, expect, it } from "vitest";
import { Keycode } from "../../src/ts/constants/keys";
import { KeySample } from "../../src/ts/trainer/key-stats";
import {
  applyTransitions,
  classifyTransition,
  getLayoutTransitions,
  LayoutTransitions,
  recordTransitions,
  replaceTransitions,
  resetTransitions,
  worstTransitions,
} from "../../src/ts/trainer/transitions";

const typed = (
  prev: Keycode,
  keycode: Keycode,
  spacingMs: number,
  overrides: Partial<KeySample> = {},
): KeySample => ({
  keycode,
  shifted: false,
  correct: true,
  prev,
  spacingMs,
  ...overrides,
});

const repeat = (sample: KeySample, times: number): KeySample[] =>
  Array.from({ length: times }, () => sample);

describe("transitions", () => {
  describe("applyTransitions", () => {
    it("keeps an ema and a count per pair", () => {
      const stats = applyTransitions({}, [
        typed("KeyD", "KeyE", 200),
        typed("KeyD", "KeyE", 400),
        typed("KeyD", "KeyK", 100),
      ]);
      expect(stats).toEqual({
        KeyD: {
          KeyE: { emaMs: 300, count: 2 },
          KeyK: { emaMs: 100, count: 1 },
        },
      });
    });

    it("moves the ema by a twentieth once a pair passes the window", () => {
      const stats = applyTransitions({}, [
        ...repeat(typed("KeyD", "KeyE", 200), 20),
        typed("KeyD", "KeyE", 400),
      ]);
      expect(stats["KeyD"]?.["KeyE"]).toEqual({ emaMs: 210, count: 21 });
    });

    it("caps a hesitation at three times the pair's average", () => {
      const stats = applyTransitions({}, [
        ...repeat(typed("KeyD", "KeyE", 200), 20),
        typed("KeyD", "KeyE", 30000),
      ]);
      expect(stats["KeyD"]?.["KeyE"]?.emaMs).toBeLessThanOrEqual(240);
      expect(stats["KeyD"]?.["KeyE"]?.count).toBe(21);
    });

    it("drops the pair that follows a wrong keypress", () => {
      const stats = applyTransitions({}, [
        typed("KeyD", "KeyE", 200, { correct: false }),
        typed("KeyE", "KeyS", 900),
        typed("KeyS", "KeyA", 200),
      ]);
      expect(stats).toEqual({ KeyS: { KeyA: { emaMs: 200, count: 1 } } });
    });

    it("skips wrong, recovering and untimed samples and the ones with no prev", () => {
      const stats = applyTransitions({}, [
        typed("KeyD", "KeyE", 200, { correct: false }),
        typed("KeyD", "KeyE", 200, { recovery: true }),
        { keycode: "KeyE", shifted: false, correct: true, prev: "KeyD" },
        { keycode: "KeyE", shifted: false, correct: true, spacingMs: 200 },
      ]);
      expect(stats).toEqual({});
    });

    it("leaves space out of both halves of a pair", () => {
      const stats = applyTransitions({}, [
        typed("Space", "KeyE", 200),
        typed("KeyE", "Space", 200),
        typed("KeyE", "KeyD", 200),
      ]);
      expect(stats).toEqual({ KeyE: { KeyD: { emaMs: 200, count: 1 } } });
    });

    it("keeps the twelve most seen next keys per prev key", () => {
      const spread: Keycode[] = [
        "KeyA",
        "KeyB",
        "KeyC",
        "KeyE",
        "KeyF",
        "KeyG",
        "KeyH",
        "KeyI",
        "KeyJ",
        "KeyL",
        "KeyM",
        "KeyN",
      ];
      let stats: LayoutTransitions = {};
      for (const [index, next] of spread.entries()) {
        stats = applyTransitions(
          stats,
          repeat(typed("KeyD", next, 200), index + 2),
        );
      }
      stats = applyTransitions(stats, [typed("KeyD", "KeyO", 200)]);
      expect(Object.keys(stats["KeyD"] ?? {})).toHaveLength(12);
      expect(stats["KeyD"]?.["KeyO"]).toBeUndefined();
      expect(stats["KeyD"]?.["KeyA"]?.count).toBe(2);
      stats = applyTransitions(stats, repeat(typed("KeyD", "KeyO", 200), 3));
      expect(stats["KeyD"]?.["KeyO"]?.count).toBe(3);
      expect(stats["KeyD"]?.["KeyA"]).toBeUndefined();
    });
  });

  describe("classifyTransition", () => {
    it("names the hand and the finger behind a pair", () => {
      expect(classifyTransition("KeyD", "KeyE")).toBe("same finger");
      expect(classifyTransition("KeyA", "KeyS")).toBe("same hand");
      expect(classifyTransition("KeyD", "KeyK")).toBe("alternating");
      expect(classifyTransition("KeyD", "F13" as Keycode)).toBe("alternating");
      expect(classifyTransition("KeyL", "KeyL")).toBe("same finger");
    });
  });

  describe("worstTransitions", () => {
    const stats: LayoutTransitions = {
      KeyD: {
        KeyK: { emaMs: 100, count: 10 },
        KeyE: { emaMs: 300, count: 10 },
      },
      KeyF: { KeyJ: { emaMs: 100, count: 10 } },
      KeyA: { KeyS: { emaMs: 250, count: 10 } },
      KeyS: { KeyX: { emaMs: 140, count: 10 } },
      KeyQ: { KeyW: { emaMs: 900, count: 2 } },
    };

    it("ranks one-handed pairs against the layout median", () => {
      expect(worstTransitions(stats, 4)).toEqual([
        {
          prev: "KeyD",
          key: "KeyE",
          emaMs: 300,
          count: 10,
          ratio: 300 / 140,
          kind: "same finger",
        },
        {
          prev: "KeyA",
          key: "KeyS",
          emaMs: 250,
          count: 10,
          ratio: 250 / 140,
          kind: "same hand",
        },
      ]);
    });

    it("takes a pair into the median and the ranking only past the minimum", () => {
      expect(worstTransitions(stats, 4, 2).map((pair) => pair.key)).toEqual([
        "KeyW",
        "KeyE",
      ]);
      expect(worstTransitions(stats, 4, 20)).toEqual([]);
    });

    it("returns the count asked for", () => {
      expect(worstTransitions(stats, 1)).toHaveLength(1);
    });

    it("puts the more seen pair first when two are equally slow", () => {
      const tied: LayoutTransitions = {
        KeyD: { KeyE: { emaMs: 300, count: 6 } },
        KeyA: { KeyS: { emaMs: 300, count: 9 } },
        KeyF: { KeyJ: { emaMs: 100, count: 10 } },
        KeyJ: { KeyF: { emaMs: 100, count: 10 } },
      };
      expect(worstTransitions(tied, 4).map((pair) => pair.key)).toEqual([
        "KeyS",
        "KeyE",
      ]);
    });
  });

  describe("the store", () => {
    beforeEach(resetTransitions);

    it("keeps a layout's pairs apart from another layout's", () => {
      recordTransitions("qwerty", [typed("KeyD", "KeyE", 200)]);
      recordTransitions("canadian_french", [typed("KeyD", "KeyE", 400)]);
      expect(getLayoutTransitions("qwerty")).toEqual({
        KeyD: { KeyE: { emaMs: 200, count: 1 } },
      });
      expect(getLayoutTransitions("canadian_french")).toEqual({
        KeyD: { KeyE: { emaMs: 400, count: 1 } },
      });
      resetTransitions();
      expect(getLayoutTransitions("qwerty")).toEqual({});
    });

    it("caps an imported row at the twelve most seen", () => {
      const row: LayoutTransitions[string] = {};
      for (let i = 0; i < 15; i++) {
        row[`Key${i}`] = { emaMs: 200, count: 100 - i };
      }
      replaceTransitions({ version: 1, layouts: { qwerty: { KeyD: row } } });
      const kept = getLayoutTransitions("qwerty")["KeyD"] ?? {};
      expect(Object.keys(kept)).toHaveLength(12);
      expect(kept["Key0"]).toEqual({ emaMs: 200, count: 100 });
      expect(kept["Key12"]).toBeUndefined();
    });
  });
});
