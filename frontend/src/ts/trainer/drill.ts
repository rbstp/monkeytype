import { Config } from "../config/store";
import { Keycode } from "../constants/keys";
import { showNoticeNotification } from "../states/notifications";
import { __nonReactive } from "../states/test";
import { keycodeToLayoutKey } from "../utils/key-converter";
import { resolveLayoutName } from "../utils/layout-name";
import {
  getLayoutStats,
  LayoutStats,
  layoutStatsName,
  worstKeys,
} from "./key-stats";
import { buildLessonWords, lessonChars, lessonIndex } from "./lessons";
import { Drill, loadCorpus, startSession } from "./session";

export const drillKeyCount = 3;
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

/**
 * Starts a 30 second session on the three worst keys of the current layout.
 * The caller restarts the test.
 */
export async function startDrill(): Promise<boolean> {
  const layoutName = layoutStatsName(
    resolveLayoutName(Config.layout, Config.keymapLayout),
    Config.funbox,
  );
  const { Space: _space, ...typed } = getLayoutStats(layoutName);
  const worst = worstKeys(typed, drillKeyCount);
  if (worst.length === 0) {
    showNoticeNotification("No key stats for this layout yet.");
    return false;
  }

  const [layout, language] = await Promise.all([
    __nonReactive.getInputLayout(),
    loadCorpus(Config.language),
  ]);
  const keys = worst.map((key) => key.keycode);
  const legends = keys
    .map((keycode) => keycodeToLayoutKey(keycode, layout))
    .filter((legend): legend is string => legend !== undefined);
  const alphabet = lessonChars(lessonIndex("z-slash"), layout).allowed;
  const words = buildDrillWords(legends, alphabet, language.words);
  const before: Drill["before"] = {};
  for (const key of worst) before[key.keycode] = key.emaMs;

  return startSession({
    words,
    indicator: `drill: ${legends.join(" ")}`,
    limit: { mode: "time", value: drillSeconds },
    drill: { keys, before },
  });
}
