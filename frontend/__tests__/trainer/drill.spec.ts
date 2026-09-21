import { describe, expect, it } from "vitest";
import { EventLog } from "../../src/ts/test/events/types";
import {
  buildDrillWords,
  drillSummary,
  reviewKeys,
  warmUpSummary,
} from "../../src/ts/trainer/drill";
import { KeyDelta } from "../../src/ts/trainer/history";
import { KeyStat, LayoutStats } from "../../src/ts/trainer/key-stats";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const alphabet = [..."abcdefghijklmnopqrstuvwxyz"];

describe("drill", () => {
  describe("buildDrillWords", () => {
    it("draws real words that contain a target key, favouring more targets", () => {
      const single = alphabet.map((letter) => `k${letter}o`);
      const real = [
        ...single,
        "fold",
        "desk",
        "fed",
        "kid",
        "moon",
        "sun",
        "bag",
      ];
      const words = buildDrillWords(
        ["k", "d", "f"],
        alphabet,
        real,
        seeded(5),
        3000,
      );
      expect(words).toHaveLength(3000);
      for (const word of words) {
        expect(real).toContain(word);
        expect(/[kdf]/.test(word)).toBe(true);
      }
      const count = (word: string): number =>
        words.filter((item) => item === word).length;
      const singleAverage =
        single.reduce((sum, word) => sum + count(word), 0) / single.length;
      expect(count("fold")).toBeGreaterThan(singleAverage * 1.5);
      expect(count("desk")).toBeGreaterThan(singleAverage * 1.5);
      expect(count("moon") + count("sun") + count("bag")).toBe(0);
    });

    it("falls back to pseudo words when the corpus runs thin", () => {
      const words = buildDrillWords(
        ["k", "d"],
        alphabet,
        ["kid"],
        seeded(9),
        60,
      );
      expect(words).toHaveLength(60);
      expect(words.filter((word) => word === "kid").length).toBeGreaterThan(0);
      const pseudo = words.filter((word) => word !== "kid");
      expect(pseudo.length).toBeGreaterThan(0);
      for (const word of pseudo) {
        for (const char of word) expect(alphabet).toContain(char);
      }
      expect(words.filter((word) => /[kd]/.test(word)).length).toBeGreaterThan(
        words.length / 2,
      );
    });

    it("builds pseudo words only without a corpus", () => {
      const words = buildDrillWords(["k"], alphabet, [], seeded(1), 20);
      expect(words).toHaveLength(20);
      expect(words.filter((word) => word.includes("k")).length).toBeGreaterThan(
        9,
      );
    });

    it("skips words outside the alphabet", () => {
      const words = buildDrillWords(
        ["k"],
        ["k", "i", "d"],
        ["kid", "keg"],
        seeded(2),
        10,
      );
      expect(words.every((word) => word !== "keg")).toBe(true);
    });
  });

  describe("drillSummary", () => {
    it("prints before and after per key", () => {
      expect(
        drillSummary(
          {
            kind: "drill",
            keys: ["KeyK", "KeyD"],
            before: { KeyK: 512.4, KeyD: 0 },
          },
          {
            KeyK: {
              emaMs: 480.2,
              timed: 3,
              errRate: 0,
              total: 3,
              errors: 0,
              lastSeen: 1,
            },
          },
          (keycode) => keycode.slice(3).toLowerCase(),
        ),
      ).toBe("k: 512 ms to 480 ms, d: no time to no time");
    });
  });

  describe("warmUpSummary", () => {
    const log = (commits: boolean[]): EventLog => ({
      version: 1,
      events: commits.map((commitsWord, index) => ({
        type: "input",
        testMs: index * 100,
        data: {
          inputType: "insertText",
          data: commitsWord ? " " : "a",
          correct: true,
          wordIndex: 0,
          charIndex: index,
          inputValue: "",
          commitsWord: commitsWord ? true : undefined,
        },
      })),
      context: {
        targetWords: [],
        mode: "custom",
        mode2: "custom",
        bailedOut: false,
        koreanStatus: false,
      },
    });

    it("counts the words committed in the log, not the wpm over the clock", () => {
      expect(warmUpSummary(log([false, false, true, false, true]))).toBe(
        "warm-up done, 2 words",
      );
    });

    it("counts nothing when no word was committed", () => {
      expect(warmUpSummary(log([false, false]))).toBe("warm-up done, 0 words");
    });

    it("ignores a delete, which carries no commit flag at all", () => {
      const base = log([true, false, true]);
      expect(
        warmUpSummary({
          ...base,
          events: [
            ...base.events,
            {
              type: "input",
              testMs: 400,
              data: {
                inputType: "deleteContentBackward",
                wordIndex: 0,
                charIndex: 0,
                inputValue: "",
              },
            },
          ],
        }),
      ).toBe("warm-up done, 2 words");
    });
  });

  describe("reviewKeys", () => {
    const stat = (overrides: Partial<KeyStat>): KeyStat => ({
      emaMs: 200,
      timed: 40,
      errRate: 0,
      total: 40,
      errors: 0,
      lastSeen: 0,
      ...overrides,
    });
    const stats: LayoutStats = {
      KeyD: stat({ errRate: 0.2, errors: 8 }),
      KeyK: stat({ emaMs: 900 }),
      KeyS: stat({}),
      KeyF: stat({}),
      KeyA: stat({}),
      KeyQ: stat({ emaMs: 800 }),
    };
    const deltas: KeyDelta[] = [
      { keycode: "KeyS", ms: 140, since: "2026-09-01" },
      { keycode: "KeyF", ms: -200, since: "2026-09-01" },
      { keycode: "KeyQ", ms: 300, since: "2026-09-01" },
    ];
    const unlocked = ["KeyD", "KeyK", "KeyS", "KeyF", "KeyA"] as const;

    it("takes the labelled keys first, then the ones a week slowed down", () => {
      expect(reviewKeys(stats, deltas, [...unlocked])).toEqual([
        "KeyD",
        "KeyK",
        "KeyS",
      ]);
    });

    it("stays inside the unlocked keys and stops at the count", () => {
      expect(reviewKeys(stats, deltas, [...unlocked, "KeyQ"])).toEqual([
        "KeyD",
        "KeyK",
        "KeyQ",
        "KeyS",
      ]);
      expect(reviewKeys(stats, deltas, [...unlocked], 2)).toEqual([
        "KeyD",
        "KeyK",
      ]);
    });

    it("finds nothing when every key is fine", () => {
      expect(reviewKeys({ KeyA: stat({}) }, [], ["KeyA"])).toEqual([]);
      expect(reviewKeys(stats, deltas, [])).toEqual([]);
    });
  });
});
