import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import {
  Attempt,
  buildLessonWords,
  canUnlock,
  countPerKey,
  lessonChars,
  LESSONS,
} from "../../src/ts/trainer/lessons";

const qwerty = JSON.parse(
  readFileSync(
    `${import.meta.dirname}/../../static/layouts/qwerty.json`,
    "utf-8",
  ),
) as LayoutObject;

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const capitals = LESSONS.findIndex((lesson) => lesson.name === "capitals");
const punctuation = LESSONS.findIndex(
  (lesson) => lesson.name === "punctuation",
);

describe("lessons", () => {
  describe("lessonChars", () => {
    it("accumulates keys across lessons", () => {
      expect(lessonChars(0, qwerty)).toEqual({
        allowed: ["a", "s", "d", "f", "j", "k", "l", ";"],
        fresh: ["a", "s", "d", "f", "j", "k", "l", ";"],
      });
      const second = lessonChars(1, qwerty);
      expect(second.fresh).toEqual(["e", "i"]);
      expect(second.allowed).toContain("a");
      expect(second.allowed).toContain("i");
    });

    it("uses the shifted layer for capitals", () => {
      const chars = lessonChars(capitals, qwerty);
      expect(chars.fresh).toContain("A");
      expect(chars.allowed).toContain("a");
    });
  });

  describe("buildLessonWords", () => {
    const options = { random: seeded(42), count: 40 };

    it("only uses allowed characters and keeps lengths in range", () => {
      const chars = lessonChars(0, qwerty);
      const words = buildLessonWords(["as", "lad", "hello"], chars, options);

      expect(words).toHaveLength(40);
      for (const word of words) {
        expect(word.length).toBeGreaterThanOrEqual(2);
        expect(word.length).toBeLessThanOrEqual(6);
        for (const char of word) expect(chars.allowed).toContain(char);
      }
    });

    it("prefers real words when enough exist", () => {
      const chars = lessonChars(0, qwerty);
      const real = ["as", "ad", "sad", "lad", "fall", "all", "ask", "dad"];
      const words = buildLessonWords(real, chars, {
        ...options,
        minReal: 5,
      });

      for (const word of words) expect(real).toContain(word);
    });

    it("makes at least half of the words use a fresh character", () => {
      const chars = lessonChars(1, qwerty);
      const words = buildLessonWords([], chars, options);
      const withFresh = words.filter((word) => /[ei]/.test(word));

      expect(withFresh.length).toBeGreaterThanOrEqual(words.length / 2);
    });

    it("stops when nothing can be generated", () => {
      expect(buildLessonWords([], { allowed: [], fresh: [] }, options)).toEqual(
        [],
      );
    });

    it("attaches fresh symbols to words", () => {
      const chars = lessonChars(punctuation, qwerty);
      const words = buildLessonWords([], chars, options);
      const withSymbol = words.filter((word) => /['\-=[\]]/.test(word));

      expect(withSymbol.length).toBeGreaterThanOrEqual(words.length / 2);
      for (const word of words) {
        for (const char of word) expect(chars.allowed).toContain(char);
      }
    });
  });

  describe("countPerKey", () => {
    it("counts only the lesson keys", () => {
      expect(
        countPerKey(
          [
            { keycode: "KeyE", shifted: false, correct: true },
            { keycode: "KeyE", shifted: false, correct: false },
            { keycode: "KeyA", shifted: false, correct: true },
          ],
          { name: "e i", newKeys: ["KeyE", "KeyI"] },
        ),
      ).toEqual({ KeyE: { total: 2, errors: 1 } });
    });

    it("counts only shifted samples for a shifted lesson", () => {
      expect(
        countPerKey(
          [
            { keycode: "KeyE", shifted: false, correct: true },
            { keycode: "KeyE", shifted: true, correct: true },
          ],
          { name: "capitals", newKeys: ["KeyE"], layer: 1 },
        ),
      ).toEqual({ KeyE: { total: 1, errors: 0 } });
    });
  });

  describe("canUnlock", () => {
    const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
      lesson: 1,
      wpm: 35,
      acc: 98,
      perKey: {
        KeyE: { total: 10, errors: 0 },
        KeyI: { total: 10, errors: 0 },
      },
      ts: 0,
      ...overrides,
    });

    it("unlocks on a single passing attempt", () => {
      expect(canUnlock([], 1)).toBe(false);
      expect(canUnlock([attempt()], 1)).toBe(true);
    });

    it("only looks at the most recent attempt of that lesson", () => {
      expect(canUnlock([attempt({ acc: 80 }), attempt()], 1)).toBe(true);
      expect(canUnlock([attempt(), attempt({ wpm: 20 })], 1)).toBe(false);
      expect(canUnlock([attempt(), attempt({ lesson: 0 })], 1)).toBe(true);
    });

    it("ignores per-key accuracy", () => {
      expect(
        canUnlock([attempt({ perKey: { KeyE: { total: 2, errors: 2 } } })], 1),
      ).toBe(true);
    });

    it("compares the values shown on the result screen", () => {
      expect(canUnlock([attempt({ wpm: 29.6, acc: 97.4 })], 1)).toBe(true);
      expect(canUnlock([attempt({ wpm: 29.4 })], 1)).toBe(false);
      expect(canUnlock([attempt({ acc: 96.9 })], 1)).toBe(false);
    });

    it("needs both wpm and accuracy", () => {
      expect(canUnlock([attempt({ acc: 96 })], 1)).toBe(false);
      expect(canUnlock([attempt({ wpm: 29 })], 1)).toBe(false);
      expect(canUnlock([attempt({ wpm: 30, acc: 97 })], 1)).toBe(true);
    });
  });
});
