import { z } from "zod";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { Keycode } from "../constants/keys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { keycodeToLayoutKey } from "../utils/key-converter";
import { KeySample } from "./key-stats";

export type Lesson = {
  name: string;
  newKeys: Keycode[];
  layer?: 0 | 1;
};

const letterKeys: Keycode[] = [
  "KeyA",
  "KeyB",
  "KeyC",
  "KeyD",
  "KeyE",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyL",
  "KeyM",
  "KeyN",
  "KeyO",
  "KeyP",
  "KeyQ",
  "KeyR",
  "KeyS",
  "KeyT",
  "KeyU",
  "KeyV",
  "KeyW",
  "KeyX",
  "KeyY",
  "KeyZ",
];

export const LESSONS: Lesson[] = [
  {
    name: "home row",
    newKeys: [
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyF",
      "KeyJ",
      "KeyK",
      "KeyL",
      "Semicolon",
    ],
  },
  { name: "e i", newKeys: ["KeyE", "KeyI"] },
  { name: "r u", newKeys: ["KeyR", "KeyU"] },
  { name: "t y", newKeys: ["KeyT", "KeyY"] },
  { name: "g h", newKeys: ["KeyG", "KeyH"] },
  { name: "w o", newKeys: ["KeyW", "KeyO"] },
  { name: "q p", newKeys: ["KeyQ", "KeyP"] },
  { name: "v m", newKeys: ["KeyV", "KeyM"] },
  { name: "c ,", newKeys: ["KeyC", "Comma"] },
  { name: "b n", newKeys: ["KeyB", "KeyN"] },
  { name: "x .", newKeys: ["KeyX", "Period"] },
  { name: "z /", newKeys: ["KeyZ", "Slash"] },
  { name: "capitals", newKeys: letterKeys, layer: 1 },
  {
    name: "punctuation",
    newKeys: ["Quote", "Minus", "Equal", "BracketLeft", "BracketRight"],
  },
  {
    name: "numbers",
    newKeys: [
      "Digit1",
      "Digit2",
      "Digit3",
      "Digit4",
      "Digit5",
      "Digit6",
      "Digit7",
      "Digit8",
      "Digit9",
      "Digit0",
    ],
  },
];

export type LessonChars = { allowed: string[]; fresh: string[] };

function lessonLegends(lesson: Lesson, layout: LayoutObject): string[] {
  return lesson.newKeys
    .map((keycode) => keycodeToLayoutKey(keycode, layout, lesson.layer ?? 0))
    .filter((legend): legend is string => legend !== undefined);
}

export function lessonChars(index: number, layout: LayoutObject): LessonChars {
  const allowed = new Set<string>();
  for (const lesson of LESSONS.slice(0, index + 1)) {
    for (const legend of lessonLegends(lesson, layout)) allowed.add(legend);
  }
  const lesson = LESSONS[index];
  const fresh = lesson === undefined ? [] : lessonLegends(lesson, layout);
  return { allowed: [...allowed], fresh };
}

export function isLessonText(words: string[], allowed: string[]): boolean {
  const chars = new Set(allowed);
  return (
    words.length > 0 &&
    words.every((word) =>
      [...word].every((char) => char === " " || chars.has(char)),
    )
  );
}

export type WordOptions = {
  count: number;
  minReal: number;
  minLength: number;
  maxLength: number;
  random: () => number;
};

const defaultWordOptions: WordOptions = {
  count: 60,
  minReal: 30,
  minLength: 2,
  maxLength: 6,
  random: Math.random,
};

const vowels = new Set("aeiouyàâäéèêëîïôöùûü");
const isLetter = (char: string): boolean => /\p{L}/u.test(char);

function pick<T>(items: T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

function pickWeighted(
  items: string[],
  favored: Set<string>,
  random: () => number,
): string {
  const pool = items.flatMap((item) =>
    favored.has(item) ? [item, item] : [item],
  );
  return pick(pool, random) ?? "";
}

function pseudoWord(
  letters: string[],
  symbols: string[],
  fresh: Set<string>,
  options: WordOptions,
): string {
  const length =
    options.minLength +
    Math.floor(options.random() * (options.maxLength - options.minLength + 1));
  const withSymbols =
    symbols.length > 0 && (letters.length === 0 || options.random() < 0.5);
  const symbolCount = withSymbols
    ? letters.length === 0
      ? length
      : 1 + Math.floor(options.random() * Math.min(3, length - 1))
    : 0;

  const vowelPool = letters.filter((letter) => vowels.has(letter));
  const consonantPool = letters.filter((letter) => !vowels.has(letter));
  const alternate = vowelPool.length > 0 && consonantPool.length > 0;
  const startWithVowel = options.random() < 0.5;

  let word = "";
  for (let i = 0; i < length - symbolCount && letters.length > 0; i++) {
    const pool = alternate
      ? startWithVowel === (i % 2 === 0)
        ? vowelPool
        : consonantPool
      : letters;
    word += pickWeighted(pool, fresh, options.random);
  }
  for (let i = 0; i < symbolCount; i++) {
    word += pickWeighted(symbols, fresh, options.random);
  }
  return word;
}

/**
 * Builds a practice word list from real words made only of allowed characters,
 * topped up with pseudo words when the real list is too short.
 * At least half of the words contain a character introduced by the lesson.
 */
export function buildLessonWords(
  realWords: string[],
  chars: LessonChars,
  overrides: Partial<WordOptions> = {},
): string[] {
  const options = { ...defaultWordOptions, ...overrides };
  const allowed = new Set(chars.allowed);
  const fresh = new Set(chars.fresh);
  const freshLetters = chars.fresh.filter(isLetter);
  const freshSymbols = chars.fresh.filter((char) => !isLetter(char));
  const letters = chars.allowed.filter(isLetter);

  const real = [
    ...new Set(
      realWords.filter(
        (word) =>
          word.length >= options.minLength &&
          [...word].every((char) => allowed.has(char)),
      ),
    ),
  ];

  const words: string[] = [];
  while (words.length < options.count) {
    const useReal =
      real.length > 0 &&
      (real.length >= options.minReal || options.random() < 0.3);
    const word = useReal
      ? (pick(real, options.random) ?? "")
      : pseudoWord(letters, freshSymbols, fresh, options);
    if (word === "") break;
    words.push(word);
  }

  const containsFresh = (word: string): boolean =>
    [...word].some((char) => fresh.has(char));
  let withFresh = words.filter(containsFresh).length;
  for (let i = 0; i < words.length; i++) {
    if (withFresh >= Math.ceil(words.length / 2)) break;
    const word = words[i] as string;
    if (containsFresh(word)) continue;
    if (freshSymbols.length > 0) {
      words[i] = word + (pick(freshSymbols, options.random) ?? "");
    } else if (freshLetters.length > 0) {
      const at = Math.floor(options.random() * (word.length + 1));
      words[i] =
        word.slice(0, at) +
        (pick(freshLetters, options.random) ?? "") +
        word.slice(at);
    } else {
      break;
    }
    withFresh++;
  }

  return words;
}

const KeyCountSchema = z.object({
  total: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type KeyCount = z.infer<typeof KeyCountSchema>;

const AttemptSchema = z.object({
  lesson: z.number().int().nonnegative(),
  wpm: z.number().nonnegative(),
  acc: z.number().nonnegative(),
  perKey: z.record(z.string(), KeyCountSchema),
  ts: z.number().nonnegative(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const ProgressSchema = z.object({
  version: z.literal(1),
  current: z.number().int().nonnegative(),
  unlocked: z.number().int().nonnegative(),
  attempts: z.array(AttemptSchema),
});
export type Progress = z.infer<typeof ProgressSchema>;

const maxAttempts = 100;

export type UnlockCriteria = {
  minAcc: number;
  minWpm: number;
  window: number;
};

export const defaultCriteria: UnlockCriteria = {
  minAcc: 97,
  minWpm: 30,
  window: 1,
};

export function countPerKey(
  samples: KeySample[],
  lesson: Lesson,
): Record<string, KeyCount> {
  const wanted = new Set<string>(lesson.newKeys);
  const shiftedOnly = lesson.layer === 1;
  const counts: Record<string, KeyCount> = {};
  for (const sample of samples) {
    if (!wanted.has(sample.keycode)) continue;
    if (shiftedOnly && !sample.shifted) continue;
    const count = counts[sample.keycode] ?? { total: 0, errors: 0 };
    count.total++;
    if (!sample.correct) count.errors++;
    counts[sample.keycode] = count;
  }
  return counts;
}

export function canUnlock(
  attempts: Attempt[],
  lesson: number,
  criteria: UnlockCriteria = defaultCriteria,
): boolean {
  const recent = attempts
    .filter((attempt) => attempt.lesson === lesson)
    .slice(-criteria.window);
  if (recent.length < criteria.window) return false;
  // compare the values the result screen shows, so a displayed 30 wpm / 97%
  // always passes the bar it is measured against
  return recent.every(
    (attempt) =>
      Math.floor(attempt.acc) >= criteria.minAcc &&
      Math.round(attempt.wpm) >= criteria.minWpm,
  );
}

const [progress, setProgress] = useLocalStorage<Progress>({
  key: "trainerProgress",
  schema: ProgressSchema,
  fallback: { version: 1, current: 0, unlocked: 0, attempts: [] },
});

export { progress };

/**
 * Re-evaluates the stored attempts against the current criteria, so a change to
 * the criteria applies to lessons already practised instead of only to the next
 * test.
 */
function syncUnlocked(): void {
  setProgress((current) => {
    let unlocked = current.unlocked;
    while (
      unlocked + 1 < LESSONS.length &&
      canUnlock(current.attempts, unlocked)
    ) {
      unlocked++;
    }
    return unlocked === current.unlocked ? current : { ...current, unlocked };
  });
}

syncUnlocked();

export function setCurrentLesson(index: number): void {
  setProgress((current) => ({ ...current, current: index }));
}

/**
 * Stores an attempt and unlocks the next lesson when the criteria are met.
 * @returns true when a new lesson was unlocked
 */
export function recordAttempt(attempt: Attempt): boolean {
  if (LESSONS[attempt.lesson] === undefined) return false;
  let unlockedNow = false;
  setProgress((current) => {
    const attempts = [...current.attempts, attempt].slice(-maxAttempts);
    const next = attempt.lesson + 1;
    unlockedNow =
      next < LESSONS.length &&
      current.unlocked < next &&
      canUnlock(attempts, attempt.lesson);
    return {
      ...current,
      attempts,
      unlocked: unlockedNow ? next : current.unlocked,
    };
  });
  return unlockedNow;
}

export function resetProgress(): void {
  setProgress({ version: 1, current: 0, unlocked: 0, attempts: [] });
}

export function replaceProgress(data: Progress): void {
  setProgress(data);
  syncUnlocked();
}
