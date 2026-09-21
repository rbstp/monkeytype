import { z } from "zod";
import { TrainerUnlock } from "@monkeytype/schemas/configs";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { Config, getConfig } from "../config/store";
import { Keycode, qwertyKeycodeKeymap } from "../constants/keys";
import { configEvent } from "../events/config";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { findLayoutKey, keycodeToLayoutKey } from "../utils/key-converter";
import { resolveLayoutName } from "../utils/layout-name";
import { deadKeyFor, hasDeadKeys } from "./dead-keys";
import { keycodeToFinger } from "./finger";
import { KeySample } from "./key-stats";

export type CharClass = "digit";

export type Lesson = {
  id: string;
  name: string;
  newKeys: Keycode[];
  layer?: 0 | 1 | "auto";
  charClass?: CharClass;
  /** target characters instead of keys, for tracks that go through dead keys */
  chars?: string[];
};

const charClassTest: Record<CharClass, (legend: string) => boolean> = {
  digit: (legend) => /^\p{Nd}$/u.test(legend),
};

const qwertyRows = [
  "`1234567890-=",
  "qwertyuiop[]\\",
  "asdfghjkl;'",
  "zxcvbnm,./",
  " ",
];
const qwertyLegends: Partial<Record<Keycode, string>> = Object.fromEntries(
  qwertyKeycodeKeymap.flatMap((row, rowIndex) =>
    row.map((keycode, keyIndex) => [keycode, qwertyRows[rowIndex]?.[keyIndex]]),
  ),
);

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

const leftLetterKeys = letterKeys.filter((key) =>
  keycodeToFinger[key]?.startsWith("L"),
);
const rightLetterKeys = letterKeys.filter((key) =>
  keycodeToFinger[key]?.startsWith("R"),
);

export const LESSONS: Lesson[] = [
  {
    id: "home-row",
    name: "a s d f j k l ;",
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
  { id: "e-i", name: "e i", newKeys: ["KeyE", "KeyI"] },
  { id: "r-u", name: "r u", newKeys: ["KeyR", "KeyU"] },
  { id: "t-y", name: "t y", newKeys: ["KeyT", "KeyY"] },
  { id: "g-h", name: "g h", newKeys: ["KeyG", "KeyH"] },
  { id: "w-o", name: "w o", newKeys: ["KeyW", "KeyO"] },
  { id: "q-p", name: "q p", newKeys: ["KeyQ", "KeyP"] },
  { id: "v-m", name: "v m", newKeys: ["KeyV", "KeyM"] },
  { id: "c-comma", name: "c ,", newKeys: ["KeyC", "Comma"] },
  { id: "b-n", name: "b n", newKeys: ["KeyB", "KeyN"] },
  { id: "x-period", name: "x .", newKeys: ["KeyX", "Period"] },
  { id: "z-slash", name: "z /", newKeys: ["KeyZ", "Slash"] },
  {
    id: "capitals-left",
    name: "capitals left",
    newKeys: leftLetterKeys,
    layer: 1,
  },
  {
    id: "capitals-right",
    name: "capitals right",
    newKeys: rightLetterKeys,
    layer: 1,
  },
  { id: "quote-minus", name: "' -", newKeys: ["Quote", "Minus"] },
  {
    id: "equal-brackets",
    name: "= [ ]",
    newKeys: ["Equal", "BracketLeft", "BracketRight"],
  },
  {
    id: "shifted-punctuation",
    name: "shifted punctuation",
    newKeys: ["Comma", "Period", "Slash", "Semicolon", "Quote", "Minus"],
    layer: 1,
  },
  { id: "accents-direct", name: "é ç", newKeys: [], chars: ["é", "ç"] },
  { id: "accents-grave", name: "è à ù", newKeys: [], chars: ["è", "à", "ù"] },
  {
    id: "accents-circumflex",
    name: "ê â î ô û",
    newKeys: [],
    chars: ["ê", "â", "î", "ô", "û"],
  },
  {
    id: "accents-diaeresis",
    name: "ë ï ü",
    newKeys: [],
    chars: ["ë", "ï", "ü"],
  },
  {
    id: "numbers",
    name: "numbers",
    layer: "auto",
    charClass: "digit",
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

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((lesson) => lesson.id === id);
}

// the lesson list as progress v2 knew it, frozen so old indices still resolve
export const LESSON_IDS_V2: readonly string[] = [
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
];

const renamedIds: Record<string, string> = {
  capitals: "capitals-left",
  punctuation: "quote-minus",
};

const currentId = (id: string): string => renamedIds[id] ?? id;

export type LessonChars = { allowed: string[]; fresh: string[] };

const layers = [0, 1, 2, 3];

// digits sit on the shifted layer on azerty, so auto takes the first fit
export function lessonKeyLegend(
  lesson: Lesson,
  keycode: Keycode,
  layout: LayoutObject,
): string | undefined {
  if (lesson.layer !== "auto") {
    return keycodeToLayoutKey(keycode, layout, lesson.layer ?? 0);
  }
  const fits = charClassTest[lesson.charClass ?? "digit"];
  for (const layer of layers) {
    const legend = keycodeToLayoutKey(keycode, layout, layer);
    if (legend !== undefined && fits(legend)) return legend;
  }
  return keycodeToLayoutKey(keycode, layout, 0);
}

// the layout emulator has no dead-key state, so dead keys count on the OS layout only
const osLayout = (): boolean => getConfig.layout === "default";

function typable(char: string, layout: LayoutObject): boolean {
  return (
    findLayoutKey(char, layout) !== undefined ||
    (osLayout() && deadKeyFor(char, layout) !== undefined)
  );
}

export function lessonLegends(lesson: Lesson, layout: LayoutObject): string[] {
  if (lesson.chars !== undefined) {
    return lesson.chars.filter((char) => typable(char, layout));
  }
  return lesson.newKeys
    .map((keycode) => lessonKeyLegend(lesson, keycode, layout))
    .filter((legend): legend is string => legend !== undefined);
}

/**
 * The keys mastery counts for a lesson on a layout: its keys, or for a
 * character track the key each character sits on, the dead key for the rest.
 */
export function lessonKeycodes(
  lesson: Lesson,
  layout: LayoutObject,
): Keycode[] {
  if (lesson.chars === undefined) return lesson.newKeys;
  const keys = new Set<Keycode>();
  for (const char of lesson.chars) {
    const key =
      findLayoutKey(char, layout)?.keycode ??
      (osLayout() ? deadKeyFor(char, layout)?.dead : undefined);
    if (key !== undefined) keys.add(key);
  }
  return [...keys];
}

// a character track needs the layout's dead-key table, which only some layouts have
export function lessonAvailable(lesson: Lesson, layoutName: string): boolean {
  return lesson.chars === undefined || (osLayout() && hasDeadKeys(layoutName));
}

export function lessonNumber(index: number, layoutName: string): number {
  return LESSONS.slice(0, index + 1).filter((lesson) =>
    lessonAvailable(lesson, layoutName),
  ).length;
}

export function nextLesson(
  index: number,
  layoutName: string,
): number | undefined {
  for (let next = index + 1; next < LESSONS.length; next++) {
    if (lessonAvailable(LESSONS[next] as Lesson, layoutName)) return next;
  }
  return undefined;
}

function usesLegendName(lesson: Lesson): boolean {
  const qwerty =
    lesson.chars ?? lesson.newKeys.map((key) => qwertyLegends[key]);
  return lesson.layer === undefined && lesson.name === qwerty.join(" ");
}

// only names that are their qwerty legends follow the layout
export function lessonName(lesson: Lesson, layout?: LayoutObject): string {
  if (layout === undefined || !usesLegendName(lesson)) return lesson.name;
  const legends = lessonLegends(lesson, layout);
  return legends.length === 0 ? lesson.name : legends.join(" ");
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
  orderedByFrequency: boolean;
  random: () => number;
  /** per character, 1 is neutral; a word draws by the mean of its characters */
  weights?: Record<string, number>;
  bigrams?: Bigrams;
};

const defaultWordOptions: WordOptions = {
  count: 120,
  minReal: 30,
  minLength: 2,
  maxLength: 6,
  orderedByFrequency: false,
  random: Math.random,
};

const rankDamping = 10;
const rankExponent = 0.6;
const minMatching = 3;

const vowels = new Set("aeiouyàâäéèêëîïôöùûü");
const isLetter = (char: string): boolean => /\p{L}/u.test(char);

const wordEnd = "";
const minBigrams = 50;

export type Bigrams = {
  starts: Record<string, number>;
  /** the next letter, or wordEnd, after a letter */
  next: Record<string, Record<string, number>>;
  pairs: number;
};

// every word counts, not only the ones the lesson can spell, so an early
// lesson still learns its pairs from the whole corpus

export function bigramTable(words: string[], allowed: string[]): Bigrams {
  const letters = new Set(allowed.filter(isLetter));
  const starts: Record<string, number> = {};
  const next: Record<string, Record<string, number>> = {};
  let pairs = 0;
  const add = (from: string, to: string): void => {
    const row = (next[from] ??= {});
    if (to !== wordEnd && row[to] === undefined) pairs++;
    row[to] = (row[to] ?? 0) + 1;
  };
  for (const word of words) {
    const chars = [...word];
    const first = chars[0];
    const last = chars[chars.length - 1];
    if (first !== undefined && letters.has(first)) {
      starts[first] = (starts[first] ?? 0) + 1;
    }
    const beforeLast = chars[chars.length - 2];
    if (
      last !== undefined &&
      beforeLast !== undefined &&
      letters.has(last) &&
      letters.has(beforeLast)
    ) {
      add(last, wordEnd);
    }
    for (let i = 1; i < chars.length; i++) {
      const from = chars[i - 1] as string;
      const to = chars[i] as string;
      if (letters.has(from) && letters.has(to)) add(from, to);
    }
  }
  return { starts, next, pairs };
}

function drawChar(
  counts: Record<string, number>,
  allowed: Set<string>,
  fresh: Set<string>,
  random: () => number,
  withEnd: boolean,
): string | undefined {
  const entries: [string, number][] = [];
  let total = 0;
  for (const [char, count] of Object.entries(counts)) {
    if (char === wordEnd ? !withEnd : !allowed.has(char)) continue;
    const weight = count * (fresh.has(char) ? 2 : 1);
    entries.push([char, weight]);
    total += weight;
  }
  if (total === 0) return undefined;
  let target = random() * total;
  for (const [char, weight] of entries) {
    target -= weight;
    if (target < 0) return char;
  }
  return entries[entries.length - 1]?.[0];
}

function bigramWord(
  letters: string[],
  fresh: Set<string>,
  bigrams: Bigrams,
  length: number,
  minLength: number,
  random: () => number,
): string | undefined {
  const allowed = new Set(letters);
  let char = drawChar(bigrams.starts, allowed, fresh, random, false);
  if (char === undefined) return undefined;
  let word = char;
  while (word.length < length) {
    const drawn = drawChar(
      bigrams.next[char] ?? {},
      allowed,
      fresh,
      random,
      word.length >= minLength,
    );
    if (drawn === undefined || drawn === wordEnd) break;
    word += drawn;
    char = drawn;
  }
  return word;
}

function alternatingWord(
  letters: string[],
  fresh: Set<string>,
  length: number,
  random: () => number,
): string {
  const vowelPool = letters.filter((letter) => vowels.has(letter));
  const consonantPool = letters.filter((letter) => !vowels.has(letter));
  const alternate = vowelPool.length > 0 && consonantPool.length > 0;
  const startWithVowel = random() < 0.5;

  let word = "";
  for (let i = 0; i < length && letters.length > 0; i++) {
    const pool = alternate
      ? startWithVowel === (i % 2 === 0)
        ? vowelPool
        : consonantPool
      : letters;
    word += pickWeighted(pool, fresh, random);
  }
  return word;
}

function pick<T>(items: T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

function meanWeight(word: string, weights: Record<string, number>): number {
  let sum = 0;
  for (const char of word) sum += weights[char] ?? 1;
  return word.length === 0 ? 1 : sum / word.length;
}

/**
 * Draws from a frequency-ordered list with weight 1 / (rank + 10) ^ 0.6, so
 * common words lead without the top ten swamping the rest, times the mean
 * character weight of the word. An unordered, unweighted list draws uniformly.
 */
function rankSampler(
  items: string[],
  ordered: boolean,
  random: () => number,
  weights?: Record<string, number>,
): () => string | undefined {
  const weighted = weights !== undefined && Object.keys(weights).length > 0;
  if (!ordered && !weighted) return () => pick(items, random);
  const cumulative: number[] = [];
  let total = 0;
  for (const [rank, word] of items.entries()) {
    const byRank = ordered ? 1 / (rank + rankDamping) ** rankExponent : 1;
    total += byRank * (weighted ? meanWeight(word, weights) : 1);
    cumulative.push(total);
  }
  return () => {
    if (items.length === 0) return undefined;
    const target = random() * total;
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((cumulative[mid] as number) < target) low = mid + 1;
      else high = mid;
    }
    return items[low];
  };
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
  bigramsOf: () => Bigrams,
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

  const letterCount = length - symbolCount;
  const bigrams = letterCount === 0 ? undefined : bigramsOf();
  let word =
    bigrams === undefined || bigrams.pairs < minBigrams
      ? undefined
      : bigramWord(
          letters,
          fresh,
          bigrams,
          letterCount,
          options.minLength,
          options.random,
        );
  word ??= alternatingWord(letters, fresh, letterCount, options.random);
  for (let i = 0; i < symbolCount; i++) {
    word += pickWeighted(symbols, fresh, options.random);
  }
  return word;
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Builds a practice word list from real words made only of allowed characters,
 * topped up with pseudo words when the real list is too short.
 * Every character the lesson introduces gets an equal share of the pool: a
 * word lacking it is swapped for a real word that has it, capitalised when the
 * lesson introduces capitals, or given the symbol at its end, so real words
 * are never mutated into gibberish and no new key goes untaught.
 */
export function buildLessonWords(
  realWords: string[],
  chars: LessonChars,
  overrides: Partial<WordOptions> = {},
): string[] {
  const options = { ...defaultWordOptions, ...overrides };
  // the ladder almost never reaches a filler, and the table costs a pass over
  // the whole corpus, so it is built on the first draw rather than every call
  let table = options.bigrams;
  const bigramsOf = (): Bigrams =>
    (table ??= bigramTable(realWords, chars.allowed));
  const allowed = new Set(chars.allowed);
  const fresh = new Set(chars.fresh);
  const freshSymbols = chars.fresh.filter((char) => !isLetter(char));
  // capitals enter pseudo words only while a lesson introduces them
  const letters = chars.allowed.filter(
    (char) =>
      isLetter(char) && (char.toLowerCase() === char || fresh.has(char)),
  );

  const real = [
    ...new Set(
      realWords.filter(
        (word) =>
          word.length >= options.minLength &&
          [...word].every((char) => allowed.has(char)),
      ),
    ),
  ];
  const drawReal = rankSampler(
    real,
    options.orderedByFrequency,
    options.random,
    options.weights,
  );
  // one real word with a rare accent would otherwise fill its whole quota
  const drawMatching = (
    test: (word: string) => boolean,
    mix: boolean,
  ): (() => string | undefined) => {
    const matching = real.filter(test);
    const draw = rankSampler(
      matching,
      options.orderedByFrequency,
      options.random,
      options.weights,
    );
    if (!mix) return draw;
    return () =>
      options.random() < matching.length / minMatching ? draw() : undefined;
  };

  const words: string[] = [];
  while (words.length < options.count) {
    const useReal =
      real.length > 0 &&
      (real.length >= options.minReal || options.random() < 0.3);
    const word = useReal
      ? (drawReal() ?? "")
      : pseudoWord(letters, freshSymbols, fresh, options, bigramsOf);
    if (word === "") break;
    words.push(word);
  }

  const lower = (char: string): string => char.toLowerCase();
  const isUpper = (char: string): boolean =>
    isLetter(char) && lower(char) !== char;
  const pseudoWith = (char: string): string => {
    const pseudo = pseudoWord(letters, freshSymbols, fresh, options, bigramsOf);
    if (isUpper(char)) return char + lower(pseudo.slice(1));
    if (pseudo.includes(char)) return pseudo;
    const at = Math.floor(options.random() * (pseudo.length + 1));
    return pseudo.slice(0, at) + char + pseudo.slice(at);
  };
  const replacementFor = (
    word: string,
    char: string,
    draw: () => string | undefined,
  ): string => {
    if (!isLetter(char)) return word + char;
    if (isUpper(char)) {
      if (word.startsWith(lower(char))) return capitalised(word);
      const drawn = draw();
      return drawn === undefined ? pseudoWith(char) : capitalised(drawn);
    }
    return draw() ?? pseudoWith(char);
  };

  const quota = Math.max(
    1,
    Math.floor(words.length / Math.max(1, chars.fresh.length)),
  );
  const touched = new Set<number>();
  for (const char of chars.fresh) {
    let have = words.filter((word) => word.includes(char)).length;
    if (have >= quota) continue;
    const draw = drawMatching(
      (word) =>
        isUpper(char) ? word.startsWith(lower(char)) : word.includes(char),
      !isUpper(char),
    );
    for (let i = 0; i < words.length && have < quota; i++) {
      const word = words[i] as string;
      if (touched.has(i) || word.includes(char)) continue;
      words[i] = replacementFor(word, char, draw);
      touched.add(i);
      have++;
    }
  }

  return words;
}

const KeyCountSchema = z.object({
  total: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type KeyCount = z.infer<typeof KeyCountSchema>;

const AttemptSchema = z.object({
  lesson: z.string(),
  layout: z.string(),
  wpm: z.number().nonnegative(),
  acc: z.number().nonnegative(),
  perKey: z.record(z.string(), KeyCountSchema),
  ts: z.number().nonnegative(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

const LayoutProgressSchema = z.object({
  current: z.string(),
  unlocked: z.string(),
  best: z.record(z.string(), z.number().nonnegative()),
});
export type LayoutProgress = z.infer<typeof LayoutProgressSchema>;

export const ProgressSchema = z.object({
  version: z.literal(3),
  layouts: z.record(z.string(), LayoutProgressSchema),
  attempts: z.array(AttemptSchema),
});
export type Progress = z.infer<typeof ProgressSchema>;

export const ProgressV2Schema = z.object({
  version: z.literal(2),
  layouts: z.record(
    z.string(),
    z.object({
      current: z.number().int().nonnegative(),
      unlocked: z.number().int().nonnegative(),
      best: z.record(z.string(), z.number().nonnegative()),
    }),
  ),
  attempts: z.array(AttemptSchema),
});
export type ProgressV2 = z.infer<typeof ProgressV2Schema>;

export const ProgressV1Schema = z.object({
  version: z.literal(1),
  current: z.number().int().nonnegative(),
  unlocked: z.number().int().nonnegative(),
  attempts: z.array(
    z.object({
      lesson: z.number().int().nonnegative(),
      wpm: z.number().nonnegative(),
      acc: z.number().nonnegative(),
      perKey: z.record(z.string(), KeyCountSchema),
      ts: z.number().nonnegative(),
    }),
  ),
});
export type ProgressV1 = z.infer<typeof ProgressV1Schema>;

const maxAttempts = 1000;
const maxAttemptsPerLesson = 50;
const v1Layout = "qwerty";

const firstLessonId = (): string => (LESSONS[0] as Lesson).id;

const emptyLayoutProgress = (): LayoutProgress => ({
  current: firstLessonId(),
  unlocked: firstLessonId(),
  best: {},
});
const emptyProgress = (): Progress => ({
  version: 3,
  layouts: {},
  attempts: [],
});

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

const criteriaByUnlock: Record<TrainerUnlock, UnlockCriteria> = {
  relaxed: { minAcc: 95, minWpm: 25, window: 1 },
  normal: defaultCriteria,
  strict: { minAcc: 98, minWpm: 35, window: 2 },
};

export function criteriaFor(unlock: TrainerUnlock): UnlockCriteria {
  return criteriaByUnlock[unlock];
}

export function countPerKey(
  samples: KeySample[],
  lesson: Lesson,
  keys: Keycode[] = lesson.newKeys,
): Record<string, KeyCount> {
  const wanted = new Set<string>(keys);
  const shiftedOnly = lesson.layer === 1;
  const counts: Record<string, KeyCount> = {};
  // a track's keys vary by layout, so the attempt lists them even when untouched
  if (lesson.chars !== undefined) {
    for (const key of keys) counts[key] = { total: 0, errors: 0 };
  }
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

function bestByLesson(
  attempts: Attempt[],
  layout: string,
): Record<string, number> {
  const best: Record<string, number> = {};
  for (const attempt of attempts) {
    if (attempt.layout !== layout) continue;
    const known = best[attempt.lesson];
    if (known === undefined || attempt.wpm > known) {
      best[attempt.lesson] = attempt.wpm;
    }
  }
  return best;
}

function upgradeV1(v1: ProgressV1): ProgressV2 {
  const attempts: Attempt[] = [];
  for (const { lesson, ...rest } of v1.attempts) {
    const id = LESSON_IDS_V2[lesson];
    if (id === undefined) continue;
    attempts.push({ ...rest, lesson: id, layout: v1Layout });
  }
  return {
    version: 2,
    layouts: {
      [v1Layout]: {
        current: v1.current,
        unlocked: v1.unlocked,
        best: bestByLesson(attempts, v1Layout),
      },
    },
    attempts,
  };
}

function renameBest(best: Record<string, number>): Record<string, number> {
  const renamed: Record<string, number> = {};
  for (const [id, wpm] of Object.entries(best)) {
    const known = renamed[currentId(id)];
    renamed[currentId(id)] = known === undefined ? wpm : Math.max(known, wpm);
  }
  return renamed;
}

// an index beyond the v2 list means the lesson list already moved on
function v2IndexToId(index: number): string {
  return currentId(LESSON_IDS_V2[index] ?? LESSON_IDS_V2[0] ?? firstLessonId());
}

/**
 * v1 kept indices under a single layout, v2 kept indices per layout, v3 keeps
 * ids so inserting or splitting a lesson never moves anyone's unlocked lesson.
 */
export function upgradeProgress(stored: ProgressV1 | ProgressV2): Progress {
  const v2 = stored.version === 1 ? upgradeV1(stored) : stored;
  const layouts: Progress["layouts"] = {};
  for (const [layout, entry] of Object.entries(v2.layouts)) {
    layouts[layout] = {
      current: v2IndexToId(entry.current),
      unlocked: v2IndexToId(entry.unlocked),
      best: renameBest(entry.best),
    };
  }
  return {
    version: 3,
    layouts,
    attempts: v2.attempts.map((attempt) => ({
      ...attempt,
      lesson: currentId(attempt.lesson),
    })),
  };
}

/**
 * Keeps the newest attempts: at most 50 per lesson and layout, 1000 overall.
 */
export function trimAttempts(attempts: Attempt[]): Attempt[] {
  const seen = new Map<string, number>();
  const kept: Attempt[] = [];
  for (let i = attempts.length - 1; i >= 0; i--) {
    const attempt = attempts[i] as Attempt;
    const group = `${attempt.layout} ${attempt.lesson}`;
    const count = seen.get(group) ?? 0;
    if (count >= maxAttemptsPerLesson) continue;
    seen.set(group, count + 1);
    kept.push(attempt);
    if (kept.length >= maxAttempts) break;
  }
  return kept.reverse();
}

const masteryWindow = 3;
const masterySampleBudget = 60;
const budgetWordsPerTest = 40;
const masteryMargin = 2 / 3;
const maxMasterySamples = 20;
const minMasterySamples = 3;
export const masteryErrorRate = 0.03;

export type KeyMastery = { samples: number; errors: number; required: number };

/**
 * Three attempts of a lesson yield about 60 fresh samples at the default test
 * length, so a wide lesson such as capitals shares that budget across its keys
 * instead of asking 20 of each. The budget follows the configured test length,
 * since mastery pools a rolling window of three attempts rather than a running
 * total: a short test kept against the full budget asks for more samples than
 * the window can ever hold, and the lesson never unlocks however well it goes.
 */
export function masterySamplesFor(
  lesson: Lesson,
  width = lesson.newKeys.length,
  wordsPerTest = getConfig.trainerWordsPerTest,
): number {
  const budget = (masterySampleBudget * wordsPerTest) / budgetWordsPerTest;
  if (width === 0) {
    return Math.min(
      maxMasterySamples,
      Math.max(minMasterySamples, Math.ceil(budget)),
    );
  }
  // a pool gives each fresh character one word in `width`, so asking for the
  // mean of a three attempt window is a coin flip per key and a wide lesson
  // needs every key to win at once; leave a third of the window as margin
  const reachable = Math.floor(
    (masteryWindow * wordsPerTest * masteryMargin) / width,
  );
  const asked = Math.max(minMasterySamples, Math.ceil(budget / width));
  return Math.min(maxMasterySamples, asked, Math.max(1, reachable));
}

function attemptsOf(
  attempts: Attempt[],
  lesson: string,
  layout: string,
): Attempt[] {
  return attempts.filter(
    (attempt) => attempt.lesson === lesson && attempt.layout === layout,
  );
}

/**
 * Pools the per-key counts of the last three attempts, so one clean test
 * cannot mask a key that failed in the two before it.
 */
export function masteryOf(
  attempts: Attempt[],
  lesson: string,
  layout: string,
): Record<string, KeyMastery> {
  const index = lessonIndex(lesson);
  const mastery: Record<string, KeyMastery> = {};
  if (index === -1) return mastery;
  const item = LESSONS[index] as Lesson;
  const required = masterySamplesFor(item);
  for (const keycode of item.newKeys) {
    mastery[keycode] = { samples: 0, errors: 0, required };
  }
  for (const attempt of attemptsOf(attempts, lesson, layout).slice(
    -masteryWindow,
  )) {
    for (const [keycode, count] of Object.entries(attempt.perKey)) {
      // a track's keys come from the attempts, since they vary by layout
      if (mastery[keycode] === undefined && item.chars !== undefined) {
        mastery[keycode] = { samples: 0, errors: 0, required };
      }
      const pooled = mastery[keycode];
      if (pooled === undefined) continue;
      pooled.samples += count.total;
      pooled.errors += count.errors;
    }
  }
  if (item.chars !== undefined) {
    const shared = masterySamplesFor(item, Object.keys(mastery).length);
    for (const key of Object.values(mastery)) key.required = shared;
  }
  return mastery;
}

export type WeakKey = { keycode: Keycode } & KeyMastery;

export type LessonPhase = "accuracy" | "speed";

export type UnlockStatus = {
  ok: boolean;
  /** accuracy while any new key is weak, speed once mastery holds */
  phase: LessonPhase;
  /** reported in the speed phase only */
  wpmShort: number;
  accShort: number;
  weakKeys: WeakKey[];
};

function errorShare(key: KeyMastery): number {
  return key.samples === 0 ? 0 : key.errors / key.samples;
}

export function isWeak(key: KeyMastery): boolean {
  return (
    key.samples < key.required || key.errors > key.samples * masteryErrorRate
  );
}

/**
 * Compares the values the result screen shows, so a displayed 30 wpm / 97%
 * always passes the bar it is measured against.
 */
export function unlockStatus(
  attempts: Attempt[],
  lesson: string,
  layout: string,
  criteria: UnlockCriteria = defaultCriteria,
): UnlockStatus {
  const recent = attemptsOf(attempts, lesson, layout).slice(-criteria.window);
  const latest = recent[recent.length - 1];
  const wpmShort =
    latest === undefined
      ? criteria.minWpm
      : Math.max(0, criteria.minWpm - Math.round(latest.wpm));
  const accShort =
    latest === undefined
      ? criteria.minAcc
      : Math.max(0, criteria.minAcc - Math.floor(latest.acc));
  const floors =
    recent.length >= criteria.window &&
    recent.every(
      (attempt) =>
        Math.floor(attempt.acc) >= criteria.minAcc &&
        Math.round(attempt.wpm) >= criteria.minWpm,
    );
  const mastery = masteryOf(attempts, lesson, layout);
  const weakKeys = (Object.entries(mastery) as [Keycode, KeyMastery][])
    .filter(([, key]) => isWeak(key))
    .map(([keycode, key]) => ({ keycode, ...key }))
    .sort((a, b) => a.samples - b.samples || errorShare(b) - errorShare(a));
  // a track learns its keys from the attempts, so nothing known means nothing mastered
  const phase: LessonPhase =
    Object.keys(mastery).length > 0 && weakKeys.length === 0
      ? "speed"
      : "accuracy";
  return {
    ok: floors && weakKeys.length === 0,
    phase,
    wpmShort: phase === "speed" ? wpmShort : 0,
    accShort,
    weakKeys,
  };
}

export function latestAttempt(
  attempts: Attempt[],
  lesson: string,
  layout: string,
): Attempt | undefined {
  return attemptsOf(attempts, lesson, layout).pop();
}

/**
 * The one sentence that names what is holding the lesson, read by the result
 * card, the lesson map and the picker so all three say the same thing.
 */
export function unlockBlocker(
  status: UnlockStatus,
  latest: Attempt | undefined,
  criteria: UnlockCriteria,
  lesson: Lesson,
  layout: LayoutObject | undefined,
): string {
  if (status.ok) return "";
  const legend = (key: WeakKey): string =>
    (layout === undefined
      ? undefined
      : lessonKeyLegend(lesson, key.keycode, layout)) ?? key.keycode;
  const accLine =
    latest === undefined
      ? undefined
      : `accuracy ${Math.floor(latest.acc)}%, ${status.accShort} short of ${criteria.minAcc}%`;
  if (status.phase === "speed") {
    if (status.wpmShort > 0 && latest !== undefined) {
      return `speed phase: ${Math.round(latest.wpm)} wpm, ${status.wpmShort} short of ${criteria.minWpm}`;
    }
    if (status.accShort > 0 && accLine !== undefined) {
      return `speed phase: ${accLine}`;
    }
    return "speed phase: pass once more to unlock";
  }
  if (status.accShort > 0 && accLine !== undefined) {
    return `accuracy phase: ${accLine}`;
  }
  const weak = status.weakKeys[0];
  if (weak === undefined) return "accuracy phase";
  if (weak.samples < weak.required) {
    return `accuracy phase: ${legend(weak)} needs ${weak.required - weak.samples} more samples`;
  }
  return `accuracy phase: ${legend(weak)} errs ${Math.round((weak.errors / weak.samples) * 100)}%, bar ${masteryErrorRate * 100}%`;
}

export function canUnlock(
  attempts: Attempt[],
  lesson: string,
  layout: string,
  criteria: UnlockCriteria = defaultCriteria,
): boolean {
  return unlockStatus(attempts, lesson, layout, criteria).ok;
}

const [progress, setProgress] = useLocalStorage<Progress>({
  key: "trainerProgress",
  schema: ProgressSchema,
  fallback: emptyProgress(),
  migrate: (value) => {
    const old = z.union([ProgressV1Schema, ProgressV2Schema]).safeParse(value);
    return old.success ? upgradeProgress(old.data) : emptyProgress();
  },
});

export { progress };

export function progressLayout(): string {
  return resolveLayoutName(getConfig.layout, getConfig.keymapLayout);
}

function layoutEntry(layout: string): LayoutProgress {
  return progress().layouts[layout] ?? emptyLayoutProgress();
}

// a read has to land somewhere, so an id the list no longer knows reads as the
// first lesson; a writer calls lessonIndex and decides what -1 means itself
function indexOrFirst(id: string): number {
  return Math.max(0, lessonIndex(id));
}

// a stored lesson the layout no longer offers falls back to the nearest one it does
function nearestAvailable(index: number, layoutName: string): number {
  for (let step = 0; step < LESSONS.length; step++) {
    for (const candidate of [index - step, index + step]) {
      const lesson = LESSONS[candidate];
      if (lesson !== undefined && lessonAvailable(lesson, layoutName)) {
        return candidate;
      }
    }
  }
  return 0;
}

export function currentLesson(): number {
  const layoutName = progressLayout();
  return nearestAvailable(
    indexOrFirst(layoutEntry(layoutName).current),
    layoutName,
  );
}

export function unlockedUpTo(): number {
  return indexOrFirst(layoutEntry(progressLayout()).unlocked);
}

export function bestOf(id: string): number | undefined {
  return layoutEntry(progressLayout()).best[id];
}

function updateLayout(
  current: Progress,
  layout: string,
  update: (entry: LayoutProgress) => LayoutProgress,
): Progress {
  const entry = current.layouts[layout] ?? emptyLayoutProgress();
  const next = update(entry);
  return next === entry
    ? current
    : { ...current, layouts: { ...current.layouts, [layout]: next } };
}

function earnedUpTo(
  attempts: Attempt[],
  layout: string,
  criteria: UnlockCriteria,
  from: number,
): number {
  let next = from;
  for (;;) {
    const following = nextLesson(next, layout);
    if (
      following === undefined ||
      !unlockStatus(attempts, (LESSONS[next] as Lesson).id, layout, criteria).ok
    ) {
      return next;
    }
    next = following;
  }
}

/**
 * Walking from the stored pointer is what keeps the sync forward-only. An id
 * the list cannot resolve would seed that walk with lesson 0 and persist it,
 * destroying the unlock.
 */
function unlockedAfterSync(
  attempts: Attempt[],
  layout: string,
  unlocked: string,
  criteria: UnlockCriteria,
): string {
  const stored = lessonIndex(unlocked);
  if (stored !== -1) {
    const walked = earnedUpTo(attempts, layout, criteria, stored);
    return (LESSONS[walked] as Lesson).id;
  }
  const earned = earnedUpTo(attempts, layout, criteria, 0);
  return earned === 0 ? unlocked : (LESSONS[earned] as Lesson).id;
}

/**
 * Re-evaluates the stored attempts against the current criteria, so a change to
 * the criteria applies to lessons already practised instead of only to the next
 * test.
 */
function syncUnlocked(): void {
  const criteria = criteriaFor(Config.trainerUnlock);
  setProgress((current) => {
    const layouts = new Set([
      ...Object.keys(current.layouts),
      ...current.attempts.map((attempt) => attempt.layout),
    ]);
    let next = current;
    for (const layout of layouts) {
      next = updateLayout(next, layout, (entry) => {
        const unlocked = unlockedAfterSync(
          current.attempts,
          layout,
          entry.unlocked,
          criteria,
        );
        return unlocked === entry.unlocked ? entry : { ...entry, unlocked };
      });
    }
    return next;
  });
}

configEvent.subscribe(({ key }) => {
  if (key === "fullConfigChangeFinished" || key === "trainerUnlock") {
    syncUnlocked();
  }
});

export function setCurrentLesson(index: number): void {
  const id = LESSONS[index]?.id;
  if (id === undefined) return;
  setProgress((current) =>
    updateLayout(current, progressLayout(), (entry) =>
      entry.current === id ? entry : { ...entry, current: id },
    ),
  );
}

/**
 * Stores an attempt and unlocks the next lesson when the criteria are met.
 * @returns true when a new lesson was unlocked
 */
export function recordAttempt(attempt: Attempt): boolean {
  const index = lessonIndex(attempt.lesson);
  if (index === -1) return false;
  let unlockedNow = false;
  setProgress((current) => {
    const attempts = trimAttempts([...current.attempts, attempt]);
    const next = nextLesson(index, attempt.layout);
    return updateLayout({ ...current, attempts }, attempt.layout, (entry) => {
      const following = next === undefined ? undefined : LESSONS[next];
      unlockedNow =
        next !== undefined &&
        following !== undefined &&
        indexOrFirst(entry.unlocked) < next &&
        unlockStatus(
          attempts,
          attempt.lesson,
          attempt.layout,
          criteriaFor(Config.trainerUnlock),
        ).ok;
      const known = entry.best[attempt.lesson];
      return {
        ...entry,
        unlocked:
          unlockedNow && following !== undefined
            ? following.id
            : entry.unlocked,
        best: {
          ...entry.best,
          [attempt.lesson]:
            known === undefined ? attempt.wpm : Math.max(known, attempt.wpm),
        },
      };
    });
  });
  return unlockedNow;
}

export function resetProgress(): void {
  setProgress(emptyProgress());
}

export function replaceProgress(data: Progress): void {
  setProgress(data);
  syncUnlocked();
}
