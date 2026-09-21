import { CompletedEvent } from "@monkeytype/schemas/results";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { Config } from "../config/store";
import { Keycode } from "../constants/keys";
import { showNoticeNotification } from "../states/notifications";
import { __nonReactive } from "../states/test";
import { keycodeToLayoutKey } from "../utils/key-converter";
import { resolveLayoutName } from "../utils/layout-name";
import { dayOf, getLayoutHistory, KeyDelta, keyDeltas } from "./history";
import {
  getLayoutStats,
  KeyStat,
  LayoutStats,
  layoutStatsName,
  worstKeys,
} from "./key-stats";
import {
  bigramTable,
  buildLessonWords,
  lessonAvailable,
  lessonChars,
  lessonIndex,
  lessonKeycodes,
  LESSONS,
  progressLayout,
  unlockedUpTo,
} from "./lessons";
import { Drill, DrillKind, loadCorpus, startSession } from "./session";
import { charWeights } from "./weights";

export const drillKeyCount = 3;
export const reviewKeyCount = 4;
export const drillSeconds = 30;
const drillWordCount = 120;
const minRealWords = 30;

function pickCumulative<T>(
  items: T[],
  weights: number[],
  random: () => number,
): T | undefined {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;
  for (let i = 0; i < items.length; i++) {
    target -= weights[i] as number;
    if (target < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Real words weighted by how many of the target keys they contain, topped up
 * with pseudo words built from the alphabet when the corpus runs thin.
 */
export function buildDrillWords(
  keys: string[],
  chars: string[],
  realWords: string[],
  random: () => number = Math.random,
  count = drillWordCount,
): string[] {
  const targets = new Set(keys);
  const allowed = new Set([...chars, ...keys]);
  const candidates = [
    ...new Set(
      realWords.filter(
        (word) =>
          word.length >= 2 && [...word].every((char) => allowed.has(char)),
      ),
    ),
  ].filter((word) => [...word].some((char) => targets.has(char)));
  const weights = candidates.map(
    (word) => new Set([...word].filter((char) => targets.has(char))).size,
  );
  let pseudo: string[] | undefined;
  let pseudoIndex = 0;
  const nextPseudo = (): string | undefined => {
    pseudo ??= buildLessonWords(
      [],
      { allowed: chars, fresh: keys },
      {
        count,
        random,
        bigrams: bigramTable(realWords, [...allowed]),
      },
    );
    return pseudo[pseudoIndex++];
  };

  const words: string[] = [];
  while (words.length < count) {
    const useReal =
      candidates.length > 0 &&
      (candidates.length >= minRealWords || random() < 0.3);
    const word = useReal
      ? pickCumulative(candidates, weights, random)
      : nextPseudo();
    if (word === undefined) break;
    words.push(word);
  }
  return words;
}

export function drillSummary(
  drill: Drill,
  stats: LayoutStats,
  legend: (keycode: Keycode) => string,
): string {
  const ms = (value: number | undefined): string =>
    value === undefined || value === 0 ? "no time" : `${Math.round(value)} ms`;
  return drill.keys
    .map(
      (keycode) =>
        `${legend(keycode)}: ${ms(drill.before[keycode])} to ${ms(stats[keycode]?.emaMs)}`,
    )
    .join(", ");
}

export function warmUpSummary(
  completed: Pick<CompletedEvent, "wpm" | "testDuration">,
): string {
  const words = Math.round((completed.wpm * completed.testDuration) / 60);
  return `warm-up done, ${words} words`;
}

function statsName(): string {
  return layoutStatsName(
    resolveLayoutName(Config.layout, Config.keymapLayout),
    Config.funbox,
  );
}

// an unlock the layout no longer offers would otherwise pull in characters the
// emulator cannot type, since unlockedUpTo does not filter by availability
function unlockedOnThisLayout(): number {
  const layoutName = progressLayout();
  let last = 0;
  for (let index = 0; index <= unlockedUpTo(); index++) {
    const lesson = LESSONS[index];
    if (lesson !== undefined && lessonAvailable(lesson, layoutName)) {
      last = index;
    }
  }
  return last;
}

function unlockedKeys(layout: LayoutObject): Keycode[] {
  const keys = new Set<Keycode>();
  const layoutName = progressLayout();
  for (const lesson of LESSONS.slice(0, unlockedOnThisLayout() + 1)) {
    if (!lessonAvailable(lesson, layoutName)) continue;
    for (const keycode of lessonKeycodes(lesson, layout)) keys.add(keycode);
  }
  keys.delete("Space");
  return [...keys];
}

// the labelled keys by the usual ranking, then the ones a week has slowed down
export function reviewKeys(
  stats: LayoutStats,
  deltas: KeyDelta[],
  unlocked: Keycode[],
  count = reviewKeyCount,
): Keycode[] {
  const scope = new Set(unlocked);
  const mine = Object.fromEntries(
    (Object.entries(stats) as [Keycode, KeyStat][]).filter(([keycode]) =>
      scope.has(keycode),
    ),
  ) as LayoutStats;
  const picked = worstKeys(mine, scope.size)
    .filter((key) => key.label !== undefined)
    .map((key) => key.keycode);
  for (const delta of deltas) {
    if (picked.length >= count) break;
    if (delta.ms <= 0 || !scope.has(delta.keycode)) continue;
    if (!picked.includes(delta.keycode)) picked.push(delta.keycode);
  }
  return picked.slice(0, count);
}

async function startKeySession(
  kind: Exclude<DrillKind, "warm-up">,
  keys: Keycode[],
  before: Drill["before"],
): Promise<boolean> {
  const [layout, language] = await Promise.all([
    __nonReactive.getInputLayout(),
    loadCorpus(Config.language),
  ]);
  const legends = keys
    .map((keycode) => keycodeToLayoutKey(keycode, layout))
    .filter((legend): legend is string => legend !== undefined);
  const alphabet = lessonChars(lessonIndex("z-slash"), layout).allowed;

  return startSession({
    words: buildDrillWords(legends, alphabet, language.words),
    indicator: `${kind}: ${legends.join(" ")}`,
    limit: { mode: "time", value: drillSeconds },
    drill: { kind, keys, before },
  });
}

/**
 * Starts a 30 second session on the three worst keys of the current layout.
 * The caller restarts the test.
 */
export async function startDrill(): Promise<boolean> {
  const { Space: _space, ...typed } = getLayoutStats(statsName());
  const worst = worstKeys(typed, drillKeyCount);
  if (worst.length === 0) {
    showNoticeNotification("No key stats for this layout yet.");
    return false;
  }
  const before: Drill["before"] = {};
  for (const key of worst) before[key.keycode] = key.emaMs;
  return startKeySession(
    "drill",
    worst.map((key) => key.keycode),
    before,
  );
}

export async function startReview(): Promise<boolean> {
  const layout = await __nonReactive.getInputLayout();
  const stats = getLayoutStats(statsName());
  const keys = reviewKeys(
    stats,
    keyDeltas(getLayoutHistory(statsName()), stats, dayOf(Date.now())),
    unlockedKeys(layout),
  );
  if (keys.length === 0) {
    showNoticeNotification("Nothing to review yet");
    return false;
  }
  const before: Drill["before"] = {};
  for (const keycode of keys) before[keycode] = stats[keycode]?.emaMs ?? 0;
  return startKeySession("review", keys, before);
}

/** A session that needs no decision. The caller restarts the test. */
export async function startWarmUp(): Promise<boolean> {
  const [layout, language] = await Promise.all([
    __nonReactive.getInputLayout(),
    loadCorpus(Config.language),
  ]);
  const words = buildLessonWords(
    language.words,
    { allowed: lessonChars(unlockedOnThisLayout(), layout).allowed, fresh: [] },
    {
      orderedByFrequency: language.orderedByFrequency === true,
      weights: charWeights(getLayoutStats(statsName()), layout),
    },
  );
  return startSession({
    words,
    indicator: "warm-up",
    limit: { mode: "time", value: drillSeconds },
    drill: { kind: "warm-up", keys: [], before: {} },
  });
}
