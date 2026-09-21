import { describe, expect, it } from "vitest";
import {
  applyConfusions,
  classifyConfusion,
  getLayoutConfusions,
  LayoutConfusions,
  minConfusions,
  recordConfusions,
  resetConfusions,
  worstConfusions,
} from "../../src/ts/trainer/confusions";
import { KeySample } from "../../src/ts/trainer/key-stats";

const wrong = (
  keycode: KeySample["keycode"],
  typed: KeySample["keycode"],
): KeySample => ({ keycode, shifted: false, correct: false, typed });

const repeat = (sample: KeySample, times: number): KeySample[] =>
  Array.from({ length: times }, () => sample);

describe("confusions", () => {
  describe("applyConfusions", () => {
    it("counts the typed key per expected key from the wrong samples", () => {
      const stats = applyConfusions({}, [
        wrong("KeyD", "KeyK"),
        wrong("KeyD", "KeyK"),
        wrong("KeyD", "KeyS"),
        { keycode: "KeyD", shifted: false, correct: true, typed: "KeyD" },
        { keycode: "KeyD", shifted: false, correct: false },
        wrong("KeyF", "KeyF"),
      ]);
      expect(stats).toEqual({ KeyD: { KeyK: 2, KeyS: 1 } });
    });

    it("keeps the eight most frequent typed keys per expected key", () => {
      const spread = [
        "KeyA",
        "KeyB",
        "KeyC",
        "KeyE",
        "KeyF",
        "KeyG",
        "KeyH",
        "KeyI",
      ] as const;
      let stats: LayoutConfusions = {};
      for (const [index, typed] of spread.entries()) {
        stats = applyConfusions(stats, repeat(wrong("KeyD", typed), index + 2));
      }
      stats = applyConfusions(stats, [wrong("KeyD", "KeyJ")]);
      expect(Object.keys(stats["KeyD"] ?? {})).toHaveLength(8);
      expect(stats["KeyD"]?.["KeyJ"]).toBeUndefined();
      expect(stats["KeyD"]?.["KeyA"]).toBe(2);
      stats = applyConfusions(stats, repeat(wrong("KeyD", "KeyJ"), 3));
      expect(stats["KeyD"]?.["KeyJ"]).toBe(3);
      expect(stats["KeyD"]?.["KeyA"]).toBeUndefined();
    });

    it("halves an expected key once its total passes 200", () => {
      let stats = applyConfusions({}, [
        ...repeat(wrong("KeyD", "KeyK"), 150),
        ...repeat(wrong("KeyD", "KeyS"), 50),
        ...repeat(wrong("KeyD", "KeyE"), 1),
      ]);
      expect(stats["KeyD"]).toEqual({ KeyK: 75, KeyS: 25 });
      stats = applyConfusions(stats, [wrong("KeyD", "KeyE")]);
      expect(stats["KeyD"]).toEqual({ KeyK: 75, KeyS: 25, KeyE: 1 });
    });

    it("leaves the other layouts and keys untouched", () => {
      const before: LayoutConfusions = { KeyA: { KeyS: 4 } };
      const after = applyConfusions(before, [wrong("KeyD", "KeyK")]);
      expect(after).toEqual({ KeyA: { KeyS: 4 }, KeyD: { KeyK: 1 } });
      expect(before).toEqual({ KeyA: { KeyS: 4 } });
    });
  });

  describe("classifyConfusion", () => {
    it("names the relation between the two keys", () => {
      expect(classifyConfusion("KeyD", "KeyE")).toBe("same finger");
      expect(classifyConfusion("KeyD", "KeyC")).toBe("same finger");
      expect(classifyConfusion("KeyD", "KeyK")).toBe("mirror hand");
      expect(classifyConfusion("KeyA", "Semicolon")).toBe("mirror hand");
      expect(classifyConfusion("KeyK", "KeyL")).toBe("neighbour");
      expect(classifyConfusion("KeyD", "KeyR")).toBe("neighbour");
      expect(classifyConfusion("KeyS", "KeyZ")).toBe("neighbour");
      expect(classifyConfusion("KeyA", "KeyM")).toBe("other");
      expect(classifyConfusion("KeyF", "KeyJ")).toBe("mirror hand");
      expect(classifyConfusion("KeyY", "KeyB")).toBe("mirror hand");
      expect(classifyConfusion("KeyQ", "KeyM")).toBe("other");
      expect(classifyConfusion("Space", "KeyB")).toBe("other");
    });
  });

  describe("worstConfusions", () => {
    it("lists pairs at or above the minimum, most frequent first", () => {
      expect(minConfusions).toBe(3);
      const stats: LayoutConfusions = {
        KeyD: { KeyK: 5, KeyS: 2 },
        KeyA: { Semicolon: 3 },
        KeyF: { KeyJ: 9 },
      };
      expect(worstConfusions(stats, 4)).toEqual([
        { expected: "KeyF", typed: "KeyJ", count: 9, kind: "mirror hand" },
        { expected: "KeyD", typed: "KeyK", count: 5, kind: "mirror hand" },
        { expected: "KeyA", typed: "Semicolon", count: 3, kind: "mirror hand" },
      ]);
      expect(worstConfusions(stats, 1)).toHaveLength(1);
      expect(worstConfusions(stats, 4, 1)).toHaveLength(4);
      expect(worstConfusions({}, 4)).toEqual([]);
    });
  });

  describe("store", () => {
    it("records per layout and resets", () => {
      resetConfusions();
      recordConfusions("qwerty", [wrong("KeyD", "KeyK")]);
      recordConfusions("qwerty", [
        { keycode: "KeyA", shifted: false, correct: true, typed: "KeyA" },
      ]);
      recordConfusions("dvorak", [wrong("KeyD", "KeyS")]);
      expect(getLayoutConfusions("qwerty")).toEqual({ KeyD: { KeyK: 1 } });
      expect(getLayoutConfusions("dvorak")).toEqual({ KeyD: { KeyS: 1 } });
      expect(getLayoutConfusions("colemak")).toEqual({});
      resetConfusions();
      expect(getLayoutConfusions("qwerty")).toEqual({});
    });
  });
});
