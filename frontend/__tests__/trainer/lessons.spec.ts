import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { setConfigStore } from "../../src/ts/config/store";
import {
  Attempt,
  bestOf,
  buildLessonWords,
  canUnlock,
  countPerKey,
  criteriaFor,
  currentLesson,
  defaultCriteria,
  lessonChars,
  lessonIndex,
  LESSONS,
  masteryOf,
  masterySamplesFor,
  progress,
  Progress,
  ProgressV1,
  recordAttempt,
  replaceProgress,
  resetProgress,
  setCurrentLesson,
  trimAttempts,
  unlockedUpTo,
  unlockStatus,
  UnlockStatus,
  upgradeProgress,
} from "../../src/ts/trainer/lessons";

function mastered(id: string, samples = 20): Attempt["perKey"] {
  const lesson = LESSONS[lessonIndex(id)];
  return Object.fromEntries(
    (lesson?.newKeys ?? []).map((keycode) => [
      keycode,
      { total: samples, errors: 0 },
    ]),
  );
}

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

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

describe("lessons", () => {
  describe("ids", () => {
    it("are unique and stable", () => {
      const ids = LESSONS.map((lesson) => lesson.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([
        "home-row",
        "e-i",
        "r-u",
        "t-y",
        "g-h",
        "w-o",
        "q-p",
        "v-m",
        "c-comma",
        "b-n",
        "x-period",
        "z-slash",
        "capitals",
        "punctuation",
        "numbers",
      ]);
      for (const id of ids) expect(/^[a-z]+(-[a-z]+)*$/.test(id)).toBe(true);
    });

    it("resolves an id back to its index", () => {
      expect(lessonIndex("home-row")).toBe(0);
      expect(lessonIndex("capitals")).toBe(capitals);
      expect(lessonIndex("missing")).toBe(-1);
    });
  });

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

      for (const word of words) {
        if (/[jk]/.test(word)) continue;
        expect(real).toContain(word.replace(/;$/, ""));
      }
    });

    it("gives every fresh character a share of the pool", () => {
      const real = ["as", "ad", "sad", "lad", "fall", "all", "ask", "dad"];
      const home = buildLessonWords(real, lessonChars(0, qwerty), {
        ...options,
        minReal: 5,
        random: seeded(21),
      });
      for (const char of lessonChars(0, qwerty).fresh) {
        expect(
          home.filter((word) => word.includes(char)).length,
        ).toBeGreaterThanOrEqual(5);
      }

      const comma = lessonChars(
        LESSONS.findIndex((lesson) => lesson.id === "c-comma"),
        qwerty,
      );
      const withComma = buildLessonWords(
        ["cat", "ice", "cake", "dice", "call", "act", "case", "rice"],
        comma,
        { ...options, minReal: 5, random: seeded(22) },
      );
      expect(
        withComma.filter((word) => word.includes(",")).length,
      ).toBeGreaterThanOrEqual(20);
      expect(
        withComma.filter((word) => word.includes("c")).length,
      ).toBeGreaterThanOrEqual(20);
      for (const word of withComma) {
        for (const char of word) expect(comma.allowed).toContain(char);
      }
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

    it("defaults to a pool of 120", () => {
      const words = buildLessonWords([], lessonChars(1, qwerty), {
        random: seeded(3),
      });
      expect(words).toHaveLength(120);
    });

    describe("rank sampling", () => {
      const alphabet = [..."abcdefghijklmnopqrstuvwxyz"];
      const toWord = (index: number): string =>
        `w${alphabet[Math.floor(index / 26)]}${alphabet[index % 26]}`;
      const ranked = Array.from({ length: 200 }, (_, index) => toWord(index));
      const chars = { allowed: alphabet, fresh: ["w"] };
      const counts = (words: string[], from: number, to: number): number =>
        words.filter((word) => {
          const rank = ranked.indexOf(word);
          return rank >= from && rank < to;
        }).length;

      it("prefers early ranks when the corpus is ordered by frequency", () => {
        const words = buildLessonWords(ranked, chars, {
          count: 2000,
          random: seeded(7),
          orderedByFrequency: true,
        });
        expect(counts(words, 0, 20)).toBeGreaterThan(
          counts(words, 180, 200) * 2,
        );
        for (const word of words) expect(ranked).toContain(word);
      });

      it("draws uniformly when the corpus is not ordered", () => {
        const words = buildLessonWords(ranked, chars, {
          count: 2000,
          random: seeded(7),
        });
        expect(counts(words, 0, 20)).toBeLessThan(counts(words, 180, 200) * 2);
        expect(counts(words, 180, 200)).toBeLessThan(counts(words, 0, 20) * 2);
      });
    });

    it("resamples a real word with a fresh character instead of mutating one", () => {
      const chars = lessonChars(1, qwerty);
      const real = ["as", "ad", "sad", "lad", "see", "is", "like", "idea"];
      const words = buildLessonWords(real, chars, {
        ...options,
        minReal: 4,
        random: seeded(11),
      });
      for (const word of words) expect(real).toContain(word);
      const withFresh = words.filter((word) => /[ei]/.test(word));
      expect(withFresh.length).toBeGreaterThanOrEqual(words.length / 2);
    });

    it("falls back to pseudo words when no real word carries a fresh character", () => {
      const chars = lessonChars(1, qwerty);
      const real = ["as", "ad", "sad", "lad", "fall", "all", "ask", "dad"];
      const words = buildLessonWords(real, chars, {
        ...options,
        minReal: 4,
        random: seeded(12),
      });
      const withFresh = words.filter((word) => /[ei]/.test(word));
      expect(withFresh.length).toBeGreaterThanOrEqual(words.length / 2);
      expect(words.some((word) => !real.includes(word))).toBe(true);
      for (const word of words) {
        if (!real.includes(word)) expect(/[ei]/.test(word)).toBe(true);
      }
    });

    it("capitalises real words for the capitals lesson", () => {
      const chars = lessonChars(capitals, qwerty);
      const real = ["the", "quick", "brown", "fox", "jumps", "over", "lazy"];
      const words = buildLessonWords(real, chars, {
        ...options,
        minReal: 4,
        random: seeded(13),
      });
      const capitalWords = words.filter((word) => /^[A-Z]/.test(word));
      expect(capitalWords.length).toBeGreaterThanOrEqual(words.length / 2);
      const realInitials = new Set(real.map((word) => word.charAt(0)));
      for (const word of words) {
        const lowered = word.charAt(0).toLowerCase() + word.slice(1);
        if (realInitials.has(lowered.charAt(0))) {
          expect(real).toContain(lowered);
        } else {
          expect(/^[A-Z]/.test(word)).toBe(true);
        }
        expect(word.slice(1)).toBe(word.slice(1).toLowerCase());
      }
      for (const word of real) expect(words).toContain(capitalised(word));
    });

    it("covers every capital from a wide corpus", () => {
      const real = [..."abcdefghijklmnopqrstuvwxyz"].map(
        (letter) => `${letter}ab`,
      );
      const words = buildLessonWords(real, lessonChars(capitals, qwerty), {
        minReal: 10,
        random: seeded(14),
      });
      for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        expect(
          words.filter((word) => word.startsWith(letter)).length,
        ).toBeGreaterThanOrEqual(4);
      }
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
          { id: "e-i", name: "e i", newKeys: ["KeyE", "KeyI"] },
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
          { id: "capitals", name: "capitals", newKeys: ["KeyE"], layer: 1 },
        ),
      ).toEqual({ KeyE: { total: 1, errors: 0 } });
    });
  });

  describe("canUnlock", () => {
    const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
      lesson: "e-i",
      layout: "qwerty",
      wpm: 35,
      acc: 98,
      perKey: mastered("e-i"),
      ts: 0,
      ...overrides,
    });
    const unlocks = (
      attempts: Attempt[],
      criteria = defaultCriteria,
    ): boolean => canUnlock(attempts, "e-i", "qwerty", criteria);

    it("unlocks on a single passing attempt", () => {
      expect(unlocks([])).toBe(false);
      expect(unlocks([attempt()])).toBe(true);
    });

    it("only looks at the most recent attempt of that lesson and layout", () => {
      expect(unlocks([attempt({ acc: 80 }), attempt()])).toBe(true);
      expect(unlocks([attempt(), attempt({ wpm: 20 })])).toBe(false);
      expect(unlocks([attempt(), attempt({ lesson: "home-row" })])).toBe(true);
      expect(unlocks([attempt(), attempt({ layout: "dvorak" })])).toBe(true);
      expect(unlocks([attempt({ layout: "dvorak" })])).toBe(false);
    });

    it("needs every new key mastered on top of the floors", () => {
      expect(
        unlocks([attempt({ perKey: { KeyE: { total: 2, errors: 2 } } })]),
      ).toBe(false);
      expect(
        unlocks([
          attempt({
            perKey: {
              KeyE: { total: 20, errors: 0 },
              KeyI: { total: 19, errors: 0 },
            },
          }),
        ]),
      ).toBe(false);
      expect(
        unlocks([
          attempt({
            perKey: {
              KeyE: { total: 20, errors: 0 },
              KeyI: { total: 100, errors: 4 },
            },
          }),
        ]),
      ).toBe(false);
      expect(
        unlocks([
          attempt({
            perKey: {
              KeyE: { total: 20, errors: 0 },
              KeyI: { total: 100, errors: 3 },
            },
          }),
        ]),
      ).toBe(true);
    });

    it("pools mastery over the last three attempts", () => {
      const seven = attempt({
        perKey: {
          KeyE: { total: 7, errors: 0 },
          KeyI: { total: 7, errors: 0 },
        },
      });
      expect(unlocks([seven, seven])).toBe(false);
      expect(unlocks([seven, seven, seven])).toBe(true);
      expect(unlocks([attempt(), seven, seven, seven])).toBe(true);
      const thin = attempt({
        perKey: {
          KeyE: { total: 1, errors: 0 },
          KeyI: { total: 1, errors: 0 },
        },
      });
      expect(unlocks([attempt(), thin, thin, thin])).toBe(false);
    });

    it("fails mastery while the floors pass", () => {
      const status = unlockStatus(
        [attempt({ perKey: { KeyE: { total: 20, errors: 0 } } })],
        "e-i",
        "qwerty",
      );
      expect(status.ok).toBe(false);
      expect(status.wpmShort).toBe(0);
      expect(status.accShort).toBe(0);
      expect(status.weakKeys).toEqual([
        { keycode: "KeyI", samples: 0, errors: 0, required: 20 },
      ]);
    });

    it("compares the values shown on the result screen", () => {
      expect(unlocks([attempt({ wpm: 29.6, acc: 97.4 })])).toBe(true);
      expect(unlocks([attempt({ wpm: 29.4 })])).toBe(false);
      expect(unlocks([attempt({ acc: 96.9 })])).toBe(false);
    });

    it("needs both wpm and accuracy", () => {
      expect(unlocks([attempt({ acc: 96 })])).toBe(false);
      expect(unlocks([attempt({ wpm: 29 })])).toBe(false);
      expect(unlocks([attempt({ wpm: 30, acc: 97 })])).toBe(true);
    });

    it("needs every attempt in the window to pass", () => {
      const strict = criteriaFor("strict");
      const pass = attempt({ wpm: 36, acc: 99 });
      expect(unlocks([pass], strict)).toBe(false);
      expect(unlocks([pass, pass], strict)).toBe(true);
      expect(unlocks([pass, attempt({ wpm: 34 }), pass], strict)).toBe(false);
      expect(unlocks([attempt({ wpm: 34 }), pass, pass], strict)).toBe(true);
    });
  });

  describe("masteryOf", () => {
    const attempt = (
      perKey: Attempt["perKey"],
      layout = "qwerty",
    ): Attempt => ({
      lesson: "e-i",
      layout,
      wpm: 30,
      acc: 97,
      perKey,
      ts: 0,
    });

    it("lists every new key of the lesson with zero counts", () => {
      expect(masteryOf([], "e-i", "qwerty")).toEqual({
        KeyE: { samples: 0, errors: 0, required: 20 },
        KeyI: { samples: 0, errors: 0, required: 20 },
      });
      expect(masteryOf([], "missing", "qwerty")).toEqual({});
    });

    it("shares the sample budget across wide lessons", () => {
      const required = (id: string): number =>
        masterySamplesFor(LESSONS[lessonIndex(id)] as (typeof LESSONS)[0]);
      expect(required("e-i")).toBe(20);
      expect(required("punctuation")).toBe(12);
      expect(required("home-row")).toBe(8);
      expect(required("numbers")).toBe(6);
      expect(required("capitals")).toBe(3);
      expect(masteryOf([], "capitals", "qwerty")["KeyQ"]).toEqual({
        samples: 0,
        errors: 0,
        required: 3,
      });
    });

    it("pools only the last three attempts of that lesson and layout", () => {
      const attempts = [
        attempt({ KeyE: { total: 100, errors: 50 } }),
        attempt({ KeyE: { total: 5, errors: 1 } }),
        attempt({
          KeyE: { total: 6, errors: 0 },
          KeyA: { total: 9, errors: 9 },
        }),
        attempt({ KeyE: { total: 40, errors: 0 } }, "dvorak"),
        attempt({ KeyI: { total: 7, errors: 2 } }),
      ];
      expect(masteryOf(attempts, "e-i", "qwerty")).toEqual({
        KeyE: { samples: 11, errors: 1, required: 20 },
        KeyI: { samples: 7, errors: 2, required: 20 },
      });
    });
  });

  describe("unlockStatus", () => {
    const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
      lesson: "e-i",
      layout: "qwerty",
      wpm: 35,
      acc: 98,
      perKey: mastered("e-i"),
      ts: 0,
      ...overrides,
    });
    const status = (
      attempts: Attempt[],
      criteria = defaultCriteria,
    ): UnlockStatus => unlockStatus(attempts, "e-i", "qwerty", criteria);

    it("passes with the floors and every key mastered", () => {
      expect(status([attempt()])).toEqual({
        ok: true,
        wpmShort: 0,
        accShort: 0,
        weakKeys: [],
      });
    });

    it("reports the wpm shortfall from the rounded latest attempt", () => {
      expect(status([attempt({ wpm: 26.6 })])).toMatchObject({
        ok: false,
        wpmShort: 3,
        accShort: 0,
      });
      expect(status([attempt(), attempt({ wpm: 20 })]).wpmShort).toBe(10);
    });

    it("reports the accuracy shortfall from the floored latest attempt", () => {
      expect(status([attempt({ acc: 95.9 })])).toMatchObject({
        ok: false,
        wpmShort: 0,
        accShort: 2,
      });
    });

    it("reports each weak key with its pooled counts, worst first", () => {
      expect(
        status([
          attempt({
            perKey: {
              KeyE: { total: 50, errors: 2 },
              KeyI: { total: 8, errors: 1 },
            },
          }),
        ]),
      ).toMatchObject({
        ok: false,
        weakKeys: [
          { keycode: "KeyI", samples: 8, errors: 1, required: 20 },
          { keycode: "KeyE", samples: 50, errors: 2, required: 20 },
        ],
      });
      expect(
        status([
          attempt({
            perKey: {
              KeyE: { total: 50, errors: 2 },
              KeyI: { total: 50, errors: 5 },
            },
          }),
        ]).weakKeys.map((key) => key.keycode),
      ).toEqual(["KeyI", "KeyE"]);
    });

    it("asks for the whole bar without attempts", () => {
      expect(status([])).toEqual({
        ok: false,
        wpmShort: 30,
        accShort: 97,
        weakKeys: [
          { keycode: "KeyE", samples: 0, errors: 0, required: 20 },
          { keycode: "KeyI", samples: 0, errors: 0, required: 20 },
        ],
      });
    });

    it("needs the strict window even when the latest attempt passes", () => {
      expect(status([attempt()], criteriaFor("strict"))).toMatchObject({
        ok: false,
        wpmShort: 0,
        accShort: 0,
        weakKeys: [],
      });
    });
  });

  describe("criteriaFor", () => {
    it("maps the unlock setting to a bar", () => {
      expect(criteriaFor("normal")).toBe(defaultCriteria);
      expect(criteriaFor("relaxed")).toEqual({
        minAcc: 95,
        minWpm: 25,
        window: 1,
      });
      expect(criteriaFor("strict")).toEqual({
        minAcc: 98,
        minWpm: 35,
        window: 2,
      });
    });
  });

  describe("upgradeProgress", () => {
    const v1Attempt = (
      lesson: number,
      wpm: number,
    ): ProgressV1["attempts"][0] => ({
      lesson,
      wpm,
      acc: 98,
      perKey: { KeyE: { total: 3, errors: 1 } },
      ts: lesson,
    });

    it("moves indices to ids under the qwerty layout and derives best", () => {
      const upgraded = upgradeProgress({
        version: 1,
        current: 2,
        unlocked: 3,
        attempts: [v1Attempt(1, 25), v1Attempt(2, 60), v1Attempt(1, 31.4)],
      });
      expect(upgraded).toEqual({
        version: 2,
        layouts: {
          qwerty: {
            current: 2,
            unlocked: 3,
            best: { "e-i": 31.4, "r-u": 60 },
          },
        },
        attempts: [
          { ...v1Attempt(1, 25), lesson: "e-i", layout: "qwerty" },
          { ...v1Attempt(2, 60), lesson: "r-u", layout: "qwerty" },
          { ...v1Attempt(1, 31.4), lesson: "e-i", layout: "qwerty" },
        ],
      });
    });

    it("drops attempts whose index has no lesson", () => {
      const upgraded = upgradeProgress({
        version: 1,
        current: 0,
        unlocked: 0,
        attempts: [v1Attempt(LESSONS.length, 40), v1Attempt(0, 20)],
      });
      expect(upgraded.attempts.map((attempt) => attempt.lesson)).toEqual([
        "home-row",
      ]);
      expect(upgraded.layouts["qwerty"]?.best).toEqual({ "home-row": 20 });
    });

    it("keeps a zero wpm attempt as a best", () => {
      expect(
        upgradeProgress({
          version: 1,
          current: 0,
          unlocked: 0,
          attempts: [v1Attempt(0, 0)],
        }).layouts["qwerty"]?.best,
      ).toEqual({ "home-row": 0 });
    });
  });

  describe("trimAttempts", () => {
    const at = (lesson: string, layout: string, ts: number): Attempt => ({
      lesson,
      layout,
      wpm: ts,
      acc: 100,
      perKey: {},
      ts,
    });

    it("keeps the newest 50 per lesson and layout", () => {
      const attempts: Attempt[] = [];
      for (let ts = 0; ts < 60; ts++) {
        attempts.push(at("e-i", "qwerty", ts));
        attempts.push(at("e-i", "dvorak", ts));
        attempts.push(at("r-u", "qwerty", ts));
      }
      const kept = trimAttempts(attempts);
      expect(kept).toHaveLength(150);
      const group = (lesson: string, layout: string): number[] =>
        kept
          .filter((a) => a.lesson === lesson && a.layout === layout)
          .map((a) => a.ts);
      expect(group("e-i", "qwerty")).toEqual(
        Array.from({ length: 50 }, (_, i) => i + 10),
      );
      expect(group("e-i", "dvorak")).toHaveLength(50);
      expect(group("r-u", "qwerty")).toHaveLength(50);
      expect(kept.map((a) => a.ts)).toEqual(
        [...kept.map((a) => a.ts)].sort((a, b) => a - b),
      );
    });

    it("caps the total at 1000 newest attempts", () => {
      const attempts: Attempt[] = [];
      for (let lesson = 0; lesson < 15; lesson++) {
        for (let ts = 0; ts < 50; ts++) {
          attempts.push(at(`l${lesson}`, "qwerty", lesson * 50 + ts));
          attempts.push(at(`l${lesson}`, "dvorak", lesson * 50 + ts));
        }
      }
      expect(attempts).toHaveLength(1500);
      const kept = trimAttempts(attempts);
      expect(kept).toHaveLength(1000);
      expect(kept[0]?.ts).toBe(250);
    });

    it("leaves a short list untouched", () => {
      const attempts = [at("e-i", "qwerty", 1), at("e-i", "qwerty", 2)];
      expect(trimAttempts(attempts)).toEqual(attempts);
    });
  });

  describe("progress store", () => {
    const attempt = (
      lesson: string,
      layout: string,
      wpm: number,
      acc = 100,
    ): Attempt => ({
      lesson,
      layout,
      wpm,
      acc,
      perKey: mastered(lesson),
      ts: 0,
    });

    beforeEach(() => {
      setConfigStore("layout", "default");
      setConfigStore("keymapLayout", "overrideSync");
      resetProgress();
    });

    it("keeps current, unlocked and best per layout", () => {
      setCurrentLesson(2);
      expect(recordAttempt(attempt("home-row", "qwerty", 40))).toBe(true);
      expect(currentLesson()).toBe(2);
      expect(unlockedUpTo()).toBe(1);
      expect(bestOf("home-row")).toBe(40);

      setConfigStore("layout", "dvorak");
      expect(currentLesson()).toBe(0);
      expect(unlockedUpTo()).toBe(0);
      expect(bestOf("home-row")).toBeUndefined();

      expect(recordAttempt(attempt("home-row", "dvorak", 33))).toBe(true);
      expect(unlockedUpTo()).toBe(1);
      expect(bestOf("home-row")).toBe(33);
      expect(progress().layouts["qwerty"]?.best).toEqual({ "home-row": 40 });
    });

    it("resolves the default layout through the keymap layout", () => {
      setConfigStore("keymapLayout", "canadian_french");
      expect(recordAttempt(attempt("home-row", "canadian_french", 40))).toBe(
        true,
      );
      expect(unlockedUpTo()).toBe(1);
      expect(progress().layouts["qwerty"]).toBeUndefined();
    });

    it("writes best from the attempt and keeps it after trimming", () => {
      expect(recordAttempt(attempt("home-row", "qwerty", 55, 90))).toBe(false);
      expect(bestOf("home-row")).toBe(55);
      for (let i = 0; i < 60; i++) {
        recordAttempt(attempt("home-row", "qwerty", 20, 90));
      }
      expect(progress().attempts).toHaveLength(50);
      expect(progress().attempts.every((a) => a.wpm === 20)).toBe(true);
      expect(bestOf("home-row")).toBe(55);
    });

    it("refuses an attempt for an unknown lesson", () => {
      expect(recordAttempt(attempt("missing", "qwerty", 55))).toBe(false);
      expect(progress().attempts).toHaveLength(0);
    });

    describe("storage", () => {
      afterEach(() => {
        localStorage.removeItem("trainerProgress");
        vi.resetModules();
      });

      it("upgrades a stored v1 blob on load and writes it back", async () => {
        localStorage.setItem(
          "trainerProgress",
          JSON.stringify({
            version: 1,
            current: 2,
            unlocked: 3,
            attempts: [
              { lesson: 1, wpm: 28, acc: 97, perKey: {}, ts: 1 },
              { lesson: 40, wpm: 28, acc: 97, perKey: {}, ts: 2 },
            ],
          }),
        );
        vi.resetModules();
        const fresh = await import("../../src/ts/trainer/lessons");
        expect(fresh.progress()).toEqual({
          version: 2,
          layouts: { qwerty: { current: 2, unlocked: 3, best: { "e-i": 28 } } },
          attempts: [
            {
              lesson: "e-i",
              layout: "qwerty",
              wpm: 28,
              acc: 97,
              perKey: {},
              ts: 1,
            },
          ],
        });
        expect(
          JSON.parse(localStorage.getItem("trainerProgress") ?? "{}").version,
        ).toBe(2);
      });
    });

    it("stores an attempt that passes the floors but not mastery without unlocking", () => {
      expect(
        recordAttempt({ ...attempt("home-row", "qwerty", 40), perKey: {} }),
      ).toBe(false);
      expect(unlockedUpTo()).toBe(0);
      expect(bestOf("home-row")).toBe(40);
      expect(progress().attempts).toHaveLength(1);
    });

    it("re-evaluates unlocks per layout on replace", () => {
      const data: Progress = {
        version: 2,
        layouts: {},
        attempts: [
          attempt("home-row", "qwerty", 40),
          attempt("e-i", "qwerty", 40),
          attempt("home-row", "dvorak", 40),
        ],
      };
      replaceProgress(data);
      expect(progress().layouts["qwerty"]?.unlocked).toBe(2);
      expect(progress().layouts["dvorak"]?.unlocked).toBe(1);
    });
  });
});
