import { describe, expect, it } from "vitest";
import { buildDrillWords, drillSummary } from "../../src/ts/trainer/drill";

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
          { keys: ["KeyK", "KeyD"], before: { KeyK: 512.4, KeyD: 0 } },
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
});
