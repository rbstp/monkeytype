import { z } from "zod";
import { TrainerUnlock } from "@monkeytype/schemas/configs";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { Config, getConfig } from "../config/store";
import { Keycode, qwertyKeycodeKeymap } from "../constants/keys";
import { configEvent } from "../events/config";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { keycodeToLayoutKey } from "../utils/key-converter";
import { resolveLayoutName } from "../utils/layout-name";
import { KeySample } from "./key-stats";

export type CharClass = "digit";

export type Lesson = {
  id: string;
  name: string;
  newKeys: Keycode[];
  layer?: 0 | 1 | "auto";
  charClass?: CharClass;
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
  { id: "capitals", name: "capitals", newKeys: letterKeys, layer: 1 },
  {
    id: "punctuation",
    name: "punctuation",
    newKeys: ["Quote", "Minus", "Equal", "BracketLeft", "BracketRight"],
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

export function lessonLegends(lesson: Lesson, layout: LayoutObject): string[] {
  return lesson.newKeys
    .map((keycode) => lessonKeyLegend(lesson, keycode, layout))
    .filter((legend): legend is string => legend !== undefined);
}

function usesLegendName(lesson: Lesson): boolean {
  return (
    lesson.layer === undefined &&
    lesson.name === lesson.newKeys.map((key) => qwertyLegends[key]).join(" ")
  );
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

const vowels = new Set("aeiouyàâäéèêëîïôöùûü");
const isLetter = (char: string): boolean => /\p{L}/u.test(char);

function pick<T>(items: T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

/**
 * Draws from a frequency-ordered list with weight 1 / (rank + 10) ^ 0.6, so
 * common words lead without the top ten swamping the rest. An unordered list
 * draws uniformly.
 */
function rankSampler(
  items: string[],
  ordered: boolean,
  random: () => number,
): () => string | undefined {
  if (!ordered) return () => pick(items, random);
  const cumulative: number[] = [];
  let total = 0;
  for (let rank = 0; rank < items.length; rank++) {
    total += 1 / (rank + rankDamping) ** rankExponent;
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
  const allowed = new Set(chars.allowed);
  const fresh = new Set(chars.fresh);
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
  const drawReal = rankSampler(
    real,
    options.orderedByFrequency,
    options.random,
  );
  const drawMatching = (
    test: (word: string) => boolean,
  ): (() => string | undefined) =>
    rankSampler(real.filter(test), options.orderedByFrequency, options.random);

  const words: string[] = [];
  while (words.length < options.count) {
    const useReal =
      real.length > 0 &&
      (real.length >= options.minReal || options.random() < 0.3);
    const word = useReal
      ? (drawReal() ?? "")
      : pseudoWord(letters, freshSymbols, fresh, options);
    if (word === "") break;
    words.push(word);
  }

  const lower = (char: string): string => char.toLowerCase();
  const isUpper = (char: string): boolean =>
    isLetter(char) && lower(char) !== char;
  const pseudoWith = (char: string): string => {
    const pseudo = pseudoWord(letters, freshSymbols, fresh, options);
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
    const draw = drawMatching((word) =>
      isUpper(char) ? word.startsWith(lower(char)) : word.includes(char),
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
  current: z.number().int().nonnegative(),
  unlocked: z.number().int().nonnegative(),
  best: z.record(z.string(), z.number().nonnegative()),
});
export type LayoutProgress = z.infer<typeof LayoutProgressSchema>;

export const ProgressSchema = z.object({
  version: z.literal(2),
  layouts: z.record(z.string(), LayoutProgressSchema),
  attempts: z.array(AttemptSchema),
});
export type Progress = z.infer<typeof ProgressSchema>;

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

const emptyLayoutProgress = (): LayoutProgress => ({
  current: 0,
  unlocked: 0,
  best: {},
});
const emptyProgress = (): Progress => ({
  version: 2,
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

export function upgradeProgress(v1: ProgressV1): Progress {
  const attempts: Attempt[] = [];
  for (const { lesson, ...rest } of v1.attempts) {
    const id = LESSONS[lesson]?.id;
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
const maxMasterySamples = 20;
const minMasterySamples = 3;
export const masteryErrorRate = 0.03;

export type KeyMastery = { samples: number; errors: number; required: number };

/**
 * Three attempts of a lesson yield about 60 fresh samples in total, so a wide
 * lesson such as capitals shares that budget across its keys instead of asking
 * 20 of each.
 */
export function masterySamplesFor(lesson: Lesson): number {
  return Math.min(
    maxMasterySamples,
    Math.max(
      minMasterySamples,
      Math.ceil(masterySampleBudget / lesson.newKeys.length),
    ),
  );
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
      const pooled = mastery[keycode];
      if (pooled === undefined) continue;
      pooled.samples += count.total;
      pooled.errors += count.errors;
    }
  }
  return mastery;
}

export type WeakKey = { keycode: Keycode } & KeyMastery;

export type UnlockStatus = {
  ok: boolean;
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
  const weakKeys = (
    Object.entries(masteryOf(attempts, lesson, layout)) as [
      Keycode,
      KeyMastery,
    ][]
  )
    .filter(([, key]) => isWeak(key))
    .map(([keycode, key]) => ({ keycode, ...key }))
    .sort((a, b) => a.samples - b.samples || errorShare(b) - errorShare(a));
  return { ok: floors && weakKeys.length === 0, wpmShort, accShort, weakKeys };
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
    const v1 = ProgressV1Schema.safeParse(value);
    return v1.success ? upgradeProgress(v1.data) : emptyProgress();
  },
});

export { progress };

export function progressLayout(): string {
  return resolveLayoutName(getConfig.layout, getConfig.keymapLayout);
}

function layoutEntry(layout: string): LayoutProgress {
  return progress().layouts[layout] ?? emptyLayoutProgress();
}

export function currentLesson(): number {
  return layoutEntry(progressLayout()).current;
}

export function unlockedUpTo(): number {
  return layoutEntry(progressLayout()).unlocked;
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

function unlockedAfterSync(
  attempts: Attempt[],
  layout: string,
  unlocked: number,
  criteria: UnlockCriteria,
): number {
  let next = unlocked;
  while (
    next + 1 < LESSONS.length &&
    unlockStatus(attempts, (LESSONS[next] as Lesson).id, layout, criteria).ok
  ) {
    next++;
  }
  return next;
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
  setProgress((current) =>
    updateLayout(current, progressLayout(), (entry) =>
      entry.current === index ? entry : { ...entry, current: index },
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
    const next = index + 1;
    return updateLayout({ ...current, attempts }, attempt.layout, (entry) => {
      unlockedNow =
        next < LESSONS.length &&
        entry.unlocked < next &&
        unlockStatus(
          attempts,
          attempt.lesson,
          attempt.layout,
          criteriaFor(Config.trainerUnlock),
        ).ok;
      const known = entry.best[attempt.lesson];
      return {
        ...entry,
        unlocked: unlockedNow ? next : entry.unlocked,
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
