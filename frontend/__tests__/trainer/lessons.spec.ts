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
  lessonAvailable,
  lessonIndex,
  LESSON_IDS_V2,
  lessonKeycodes,
  lessonKeyLegend,
  lessonName,
  lessonNumber,
  LESSONS,
  masteryOf,
  nextLesson,
  masterySamplesFor,
  progress,
  Progress,
  ProgressV1,
  ProgressV2,
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

function readLayout(name: string): LayoutObject {
  return JSON.parse(
    readFileSync(
      `${import.meta.dirname}/../../static/layouts/${name}.json`,
      "utf-8",
    ),
  ) as LayoutObject;
}

const qwerty = readLayout("qwerty");
const dvorak = readLayout("dvorak");
const azerty = readLayout("azerty");
const colemak = readLayout("colemak");
const canadianFrench = readLayout("canadian_french");

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const capitals = lessonIndex("capitals-left");
const punctuation = lessonIndex("quote-minus");

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
        "capitals-left",
        "capitals-right",
        "quote-minus",
        "equal-brackets",
        "shifted-punctuation",
        "accents-direct",
        "accents-grave",
        "accents-circumflex",
        "accents-diaeresis",
        "numbers",
      ]);
      for (const id of ids) expect(/^[a-z]+(-[a-z]+)*$/.test(id)).toBe(true);
    });

    it("keeps the v2 list frozen", () => {
      expect(LESSON_IDS_V2).toEqual([
        ...LESSONS.slice(0, 12).map((lesson) => lesson.id),
        "capitals",
        "punctuation",
        "numbers",
      ]);
    });

    it("resolves an id back to its index", () => {
      expect(lessonIndex("home-row")).toBe(0);
      expect(lessonIndex("capitals-left")).toBe(capitals);
      expect(lessonIndex("missing")).toBe(-1);
    });

    it("splits the capitals by hand and covers every letter once", () => {
      const left = LESSONS[capitals]?.newKeys ?? [];
      const right = LESSONS[lessonIndex("capitals-right")]?.newKeys ?? [];
      expect(left).toEqual([
        "KeyA",
        "KeyB",
        "KeyC",
        "KeyD",
        "KeyE",
        "KeyF",
        "KeyG",
        "KeyQ",
        "KeyR",
        "KeyS",
        "KeyT",
        "KeyV",
        "KeyW",
        "KeyX",
        "KeyZ",
      ]);
      expect(right).toEqual([
        "KeyH",
        "KeyI",
        "KeyJ",
        "KeyK",
        "KeyL",
        "KeyM",
        "KeyN",
        "KeyO",
        "KeyP",
        "KeyU",
        "KeyY",
      ]);
      expect([...left, ...right].sort()).toEqual(
        [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((letter) => `Key${letter}`),
      );
      expect(lessonChars(capitals, qwerty).fresh.join("")).toBe(
        "ABCDEFGQRSTVWXZ",
      );
    });

    it("lays the punctuation ladder out in three steps", () => {
      expect(LESSONS[lessonIndex("quote-minus")]).toEqual({
        id: "quote-minus",
        name: "' -",
        newKeys: ["Quote", "Minus"],
      });
      expect(LESSONS[lessonIndex("equal-brackets")]).toEqual({
        id: "equal-brackets",
        name: "= [ ]",
        newKeys: ["Equal", "BracketLeft", "BracketRight"],
      });
      expect(LESSONS[lessonIndex("shifted-punctuation")]).toMatchObject({
        newKeys: ["Comma", "Period", "Slash", "Semicolon", "Quote", "Minus"],
        layer: 1,
      });
      expect(
        lessonChars(lessonIndex("shifted-punctuation"), qwerty).fresh,
      ).toEqual(["<", ">", "?", ":", '"', "_"]);
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

    it("resolves the accents track through direct legends and dead keys", () => {
      const direct = lessonIndex("accents-direct");
      const grave = lessonIndex("accents-grave");
      expect(lessonChars(direct, canadianFrench).fresh).toEqual(["é", "ç"]);
      expect(lessonChars(grave, canadianFrench).fresh).toEqual(["è", "à", "ù"]);
      expect(lessonChars(grave, canadianFrench).allowed).toContain("é");
      expect(
        lessonChars(lessonIndex("accents-diaeresis"), canadianFrench).fresh,
      ).toEqual(["ë", "ï", "ü"]);
      expect(lessonChars(grave, qwerty).fresh).toEqual([]);
      expect(lessonChars(lessonIndex("numbers"), qwerty).allowed).not.toContain(
        "è",
      );
      expect(lessonChars(direct, azerty).fresh).toEqual(["é", "ç"]);
      expect(lessonChars(grave, azerty).fresh).toEqual(["è", "à", "ù"]);
      expect(
        lessonChars(lessonIndex("accents-circumflex"), azerty).fresh,
      ).toEqual([]);
    });

    it("offers dead keys on the OS layout only", () => {
      const grave = lessonIndex("accents-grave");
      setConfigStore("layout", "canadian_french");
      expect(lessonChars(grave, canadianFrench).fresh).toEqual([]);
      expect(
        lessonChars(lessonIndex("accents-direct"), canadianFrench).fresh,
      ).toEqual(["é", "ç"]);
      expect(
        lessonChars(lessonIndex("numbers"), canadianFrench).allowed,
      ).not.toContain("è");
      expect(
        lessonKeycodes(LESSONS[grave] as (typeof LESSONS)[0], canadianFrench),
      ).toEqual([]);
      expect(
        lessonAvailable(
          LESSONS[grave] as (typeof LESSONS)[0],
          "canadian_french",
        ),
      ).toBe(false);
      setConfigStore("layout", "default");
      expect(lessonChars(grave, canadianFrench).fresh).toEqual(["è", "à", "ù"]);
      expect(
        lessonAvailable(
          LESSONS[grave] as (typeof LESSONS)[0],
          "canadian_french",
        ),
      ).toBe(true);
    });

    it("counts mastery on the key each character sits on, or its dead key", () => {
      const grave = LESSONS[
        lessonIndex("accents-grave")
      ] as (typeof LESSONS)[0];
      const direct = LESSONS[
        lessonIndex("accents-direct")
      ] as (typeof LESSONS)[0];
      expect(lessonKeycodes(grave, canadianFrench)).toEqual(["Quote"]);
      expect(lessonKeycodes(direct, canadianFrench)).toEqual(["Slash", "KeyC"]);
      expect(lessonKeycodes(grave, qwerty)).toEqual([]);
      expect(lessonKeycodes(LESSONS[1] as (typeof LESSONS)[0], qwerty)).toEqual(
        ["KeyE", "KeyI"],
      );
    });

    it("resolves digits through the auto layer on any layout", () => {
      const numbers = lessonIndex("numbers");
      const digits = [..."1234567890"];
      expect(lessonChars(numbers, qwerty).fresh).toEqual(digits);
      expect(lessonChars(numbers, azerty).fresh).toEqual(digits);
      expect(lessonChars(numbers, colemak).fresh).toEqual(digits);
      expect(lessonChars(numbers, azerty).allowed).not.toContain("&");
    });
  });

  describe("availability", () => {
    const grave = lessonIndex("accents-grave");
    const numbers = lessonIndex("numbers");
    const shifted = lessonIndex("shifted-punctuation");

    it("hides the accents track on layouts without a dead-key table", () => {
      const graveLesson = LESSONS[grave] as (typeof LESSONS)[0];
      expect(lessonAvailable(graveLesson, "canadian_french")).toBe(true);
      expect(lessonAvailable(graveLesson, "qwerty")).toBe(false);
      expect(lessonAvailable(LESSONS[0] as (typeof LESSONS)[0], "qwerty")).toBe(
        true,
      );
    });

    it("numbers the lessons the layout can type", () => {
      expect(LESSONS).toHaveLength(22);
      expect(lessonNumber(0, "qwerty")).toBe(1);
      expect(lessonNumber(shifted, "qwerty")).toBe(17);
      expect(lessonNumber(numbers, "qwerty")).toBe(18);
      expect(lessonNumber(numbers, "canadian_french")).toBe(22);
      expect(lessonNumber(grave, "canadian_french")).toBe(19);
    });

    it("steps to the next lesson the layout can type", () => {
      expect(nextLesson(0, "qwerty")).toBe(1);
      expect(nextLesson(shifted, "qwerty")).toBe(numbers);
      expect(nextLesson(shifted, "canadian_french")).toBe(shifted + 1);
      expect(nextLesson(numbers, "qwerty")).toBeUndefined();
      expect(nextLesson(numbers, "canadian_french")).toBeUndefined();
    });
  });

  describe("lessonName", () => {
    const named = (id: string, layout?: LayoutObject): string =>
      lessonName(LESSONS[lessonIndex(id)] as (typeof LESSONS)[0], layout);

    it("derives the two-key and home row names from the layout legends", () => {
      expect(named("home-row", qwerty)).toBe("a s d f j k l ;");
      expect(named("home-row", dvorak)).toBe("a o e u h t n s");
      expect(named("e-i", qwerty)).toBe("e i");
      expect(named("e-i", dvorak)).toBe(". c");
      expect(named("c-comma", dvorak)).toBe("j w");
      expect(named("z-slash", colemak)).toBe("z /");
    });

    it("keeps the fixed names on every layout", () => {
      const fixed = {
        "capitals-left": "capitals left",
        "capitals-right": "capitals right",
        "shifted-punctuation": "shifted punctuation",
        numbers: "numbers",
      };
      for (const [id, name] of Object.entries(fixed)) {
        expect(named(id, qwerty)).toBe(name);
        expect(named(id, dvorak)).toBe(name);
      }
    });

    it("names the accents by the characters the layout can type", () => {
      expect(named("accents-grave", canadianFrench)).toBe("è à ù");
      expect(named("accents-grave", qwerty)).toBe("è à ù");
      expect(named("accents-circumflex", azerty)).toBe("ê â î ô û");
      expect(named("accents-grave")).toBe("è à ù");
    });

    it("derives the ladder names from the legends", () => {
      expect(named("quote-minus", qwerty)).toBe("' -");
      expect(named("quote-minus", dvorak)).toBe("- [");
      expect(named("equal-brackets", qwerty)).toBe("= [ ]");
      expect(named("equal-brackets", dvorak)).toBe("] / =");
    });

    it("falls back to the qwerty name without a layout", () => {
      expect(named("e-i")).toBe("e i");
      expect(named("home-row")).toBe("a s d f j k l ;");
    });
  });

  describe("lessonKeyLegend", () => {
    it("reads the lesson layer, or the first layer that fits the class", () => {
      const capitalsLesson = LESSONS[capitals] as (typeof LESSONS)[0];
      const numbers = LESSONS[lessonIndex("numbers")] as (typeof LESSONS)[0];
      expect(lessonKeyLegend(capitalsLesson, "KeyA", qwerty)).toBe("A");
      expect(lessonKeyLegend(numbers, "Digit1", azerty)).toBe("1");
      expect(lessonKeyLegend(numbers, "Digit1", qwerty)).toBe("1");
      expect(lessonKeyLegend(numbers, "KeyA", qwerty)).toBe("a");
      expect(
        lessonKeyLegend(LESSONS[1] as (typeof LESSONS)[0], "KeyE", dvorak),
      ).toBe(".");
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
      const real = ["the", "quick", "brown", "fox", "water", "every", "grab"];
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

    it("covers every capital of the hand from a wide corpus", () => {
      const real = [..."abcdefghijklmnopqrstuvwxyz"].map(
        (letter) => `${letter}ab`,
      );
      for (const id of ["capitals-left", "capitals-right"]) {
        const chars = lessonChars(lessonIndex(id), qwerty);
        const words = buildLessonWords(real, chars, {
          minReal: 10,
          random: seeded(14),
        });
        for (const letter of chars.fresh) {
          expect(
            words.filter((word) => word.startsWith(letter)).length,
          ).toBeGreaterThanOrEqual(4);
        }
      }
    });

    it("draws accented words from the corpus and falls back to pseudo words", () => {
      const chars = lessonChars(lessonIndex("accents-grave"), canadianFrench);
      const real = [
        "très",
        "après",
        "père",
        "mère",
        "élève",
        "là",
        "déjà",
        "où",
      ];
      const words = buildLessonWords(real, chars, {
        ...options,
        minReal: 4,
        random: seeded(31),
      });
      for (const accent of chars.fresh) {
        expect(
          words.filter((word) => word.includes(accent)).length,
        ).toBeGreaterThanOrEqual(10);
      }
      expect(
        words.filter((word) => real.includes(word)).length,
      ).toBeGreaterThan(0);
      for (const word of words) {
        for (const char of word) expect(chars.allowed).toContain(char);
      }

      const pseudo = buildLessonWords(["as", "sad"], chars, {
        ...options,
        random: seeded(32),
      });
      for (const accent of chars.fresh) {
        expect(
          pseudo.filter((word) => word.includes(accent)).length,
        ).toBeGreaterThanOrEqual(10);
      }
      for (const word of pseudo) expect(word).toBe(word.toLowerCase());

      const rare = buildLessonWords(["où", ...real.slice(0, 5)], chars, {
        ...options,
        minReal: 4,
        random: seeded(33),
      });
      const withU = rare.filter((word) => word.includes("ù"));
      expect(withU.length).toBeGreaterThanOrEqual(10);
      expect(withU.filter((word) => word !== "où").length).toBeGreaterThan(
        withU.length / 3,
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
          { id: "e-i", name: "e i", newKeys: ["KeyE", "KeyI"] },
        ),
      ).toEqual({ KeyE: { total: 2, errors: 1 } });
    });

    it("counts every layer for an auto lesson", () => {
      expect(
        countPerKey(
          [
            { keycode: "Digit1", shifted: false, correct: true },
            { keycode: "Digit1", shifted: true, correct: false },
          ],
          {
            id: "numbers",
            name: "numbers",
            newKeys: ["Digit1"],
            layer: "auto",
            charClass: "digit",
          },
        ),
      ).toEqual({ Digit1: { total: 2, errors: 1 } });
    });

    it("lists every key of a track, touched or not, and counts the given keys", () => {
      const grave = LESSONS[
        lessonIndex("accents-grave")
      ] as (typeof LESSONS)[0];
      expect(
        countPerKey(
          [
            { keycode: "Quote", shifted: false, correct: true },
            { keycode: "KeyE", shifted: false, correct: true },
            { keycode: "Quote", shifted: false, correct: false },
          ],
          grave,
          ["Quote", "BracketLeft"],
        ),
      ).toEqual({
        Quote: { total: 2, errors: 1 },
        BracketLeft: { total: 0, errors: 0 },
      });
      expect(
        countPerKey(
          [{ keycode: "Quote", shifted: false, correct: true }],
          grave,
        ),
      ).toEqual({});
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
      expect(required("quote-minus")).toBe(20);
      expect(required("equal-brackets")).toBe(20);
      expect(required("shifted-punctuation")).toBe(10);
      expect(required("home-row")).toBe(8);
      expect(required("numbers")).toBe(6);
      expect(required("capitals-left")).toBe(4);
      expect(required("capitals-right")).toBe(6);
      const grave = LESSONS[
        lessonIndex("accents-grave")
      ] as (typeof LESSONS)[0];
      expect(masterySamplesFor(grave)).toBe(20);
      expect(masterySamplesFor(grave, 1)).toBe(20);
      expect(masterySamplesFor(grave, 2)).toBe(20);
      expect(masterySamplesFor(grave, 5)).toBe(12);
      expect(masteryOf([], "capitals-left", "qwerty")["KeyQ"]).toEqual({
        samples: 0,
        errors: 0,
        required: 4,
      });
    });

    it("reads the keys of a track from its attempts", () => {
      expect(masteryOf([], "accents-grave", "canadian_french")).toEqual({});
      const graveAttempt = (perKey: Attempt["perKey"], wpm = 30): Attempt => ({
        ...attempt(perKey),
        lesson: "accents-grave",
        layout: "canadian_french",
        wpm,
      });
      expect(
        masteryOf(
          [
            graveAttempt({ Quote: { total: 5, errors: 1 } }),
            graveAttempt({ Quote: { total: 6, errors: 0 } }),
          ],
          "accents-grave",
          "canadian_french",
        ),
      ).toEqual({ Quote: { samples: 11, errors: 1, required: 20 } });
      expect(
        masteryOf(
          [
            graveAttempt({
              Quote: { total: 5, errors: 0 },
              BracketLeft: { total: 1, errors: 0 },
              BracketRight: { total: 0, errors: 0 },
              Slash: { total: 0, errors: 0 },
              KeyC: { total: 0, errors: 0 },
            }),
          ],
          "accents-grave",
          "canadian_french",
        )["Quote"],
      ).toEqual({ samples: 5, errors: 0, required: 12 });
      expect(
        unlockStatus(
          [graveAttempt({ Quote: { total: 20, errors: 0 } }, 40)],
          "accents-grave",
          "canadian_french",
        ).ok,
      ).toBe(true);
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
        version: 3,
        layouts: {
          qwerty: {
            current: "r-u",
            unlocked: "t-y",
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
        attempts: [v1Attempt(LESSON_IDS_V2.length, 40), v1Attempt(0, 20)],
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

    const v2Attempt = (
      lesson: string,
      wpm: number,
      layout = "qwerty",
    ): Attempt => ({
      lesson,
      layout,
      wpm,
      acc: 98,
      perKey: {},
      ts: wpm,
    });

    it("keeps the unlocked lesson by id after the capitals split", () => {
      const v2: ProgressV2 = {
        version: 2,
        layouts: {
          qwerty: { current: 12, unlocked: 13, best: { capitals: 40 } },
          dvorak: { current: 0, unlocked: 14, best: {} },
        },
        attempts: [
          v2Attempt("capitals", 40),
          v2Attempt("numbers", 33, "dvorak"),
        ],
      };
      const upgraded = upgradeProgress(v2);
      expect(upgraded.layouts["qwerty"]).toEqual({
        current: "capitals-left",
        unlocked: "quote-minus",
        best: { "capitals-left": 40 },
      });
      expect(upgraded.layouts["dvorak"]).toEqual({
        current: "home-row",
        unlocked: "numbers",
        best: {},
      });
      expect(lessonIndex("quote-minus")).toBeGreaterThan(13);
      expect(lessonIndex("numbers")).toBeGreaterThan(14);
      expect(upgraded.attempts.map((attempt) => attempt.lesson)).toEqual([
        "capitals-left",
        "numbers",
      ]);
    });

    it("maps the old ids and merges their bests", () => {
      const upgraded = upgradeProgress({
        version: 2,
        layouts: {
          qwerty: {
            current: 13,
            unlocked: 13,
            best: { capitals: 40, "capitals-left": 45, punctuation: 30 },
          },
        },
        attempts: [v2Attempt("punctuation", 30), v2Attempt("e-i", 50)],
      });
      expect(upgraded.layouts["qwerty"]?.best).toEqual({
        "capitals-left": 45,
        "quote-minus": 30,
      });
      expect(upgraded.attempts.map((attempt) => attempt.lesson)).toEqual([
        "quote-minus",
        "e-i",
      ]);
    });

    it("sends an index beyond the v2 list back to the first lesson", () => {
      expect(
        upgradeProgress({
          version: 2,
          layouts: { qwerty: { current: 40, unlocked: 99, best: {} } },
          attempts: [],
        }).layouts["qwerty"],
      ).toEqual({ current: "home-row", unlocked: "home-row", best: {} });
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
          version: 3,
          layouts: {
            qwerty: { current: "r-u", unlocked: "t-y", best: { "e-i": 28 } },
          },
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
        ).toBe(3);
      });

      it("upgrades a stored v2 blob on load and keeps the unlocked lesson", async () => {
        localStorage.setItem(
          "trainerProgress",
          JSON.stringify({
            version: 2,
            layouts: {
              qwerty: { current: 13, unlocked: 13, best: { punctuation: 31 } },
            },
            attempts: [],
          }),
        );
        vi.resetModules();
        const fresh = await import("../../src/ts/trainer/lessons");
        expect(fresh.progress()).toEqual({
          version: 3,
          layouts: {
            qwerty: {
              current: "quote-minus",
              unlocked: "quote-minus",
              best: { "quote-minus": 31 },
            },
          },
          attempts: [],
        });
        expect(
          JSON.parse(localStorage.getItem("trainerProgress") ?? "{}").version,
        ).toBe(3);
      });
    });

    it("resolves an unknown stored id to the first lesson", () => {
      replaceProgress({
        version: 3,
        layouts: { qwerty: { current: "gone", unlocked: "gone", best: {} } },
        attempts: [],
      });
      expect(currentLesson()).toBe(0);
      expect(unlockedUpTo()).toBe(0);
      setCurrentLesson(2);
      expect(progress().layouts["qwerty"]?.current).toBe("r-u");
      setCurrentLesson(99);
      expect(progress().layouts["qwerty"]?.current).toBe("r-u");
    });

    it("falls back to the nearest lesson the layout offers", () => {
      replaceProgress({
        version: 3,
        layouts: {
          qwerty: {
            current: "accents-grave",
            unlocked: "accents-diaeresis",
            best: {},
          },
        },
        attempts: [],
      });
      expect(currentLesson()).toBe(lessonIndex("shifted-punctuation"));
      setConfigStore("keymapLayout", "canadian_french");
      replaceProgress({
        version: 3,
        layouts: {
          canadian_french: {
            current: "accents-grave",
            unlocked: "accents-grave",
            best: {},
          },
        },
        attempts: [],
      });
      expect(currentLesson()).toBe(lessonIndex("accents-grave"));
      setConfigStore("keymapLayout", "overrideSync");
    });

    it("stores the unlocked lesson as an id", () => {
      expect(recordAttempt(attempt("home-row", "qwerty", 40))).toBe(true);
      expect(progress().layouts["qwerty"]?.unlocked).toBe("e-i");
      expect(recordAttempt(attempt("home-row", "qwerty", 40))).toBe(false);
      expect(progress().layouts["qwerty"]?.unlocked).toBe("e-i");
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
        version: 3,
        layouts: {},
        attempts: [
          attempt("home-row", "qwerty", 40),
          attempt("e-i", "qwerty", 40),
          attempt("home-row", "dvorak", 40),
        ],
      };
      replaceProgress(data);
      expect(progress().layouts["qwerty"]?.unlocked).toBe("r-u");
      expect(progress().layouts["dvorak"]?.unlocked).toBe("e-i");
    });
  });
});
