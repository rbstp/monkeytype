import { z } from "zod";
import { Keycode } from "../constants/keys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { Finger, keycodeToFinger } from "./finger";
import { KeySample } from "./key-stats";

const PairSchema = z.object({
  emaMs: z.number().nonnegative(),
  count: z.number().int().nonnegative(),
});
export type TransitionPair = z.infer<typeof PairSchema>;

const LayoutTransitionsSchema = z.record(
  z.string(),
  z.record(z.string(), PairSchema),
);
export type LayoutTransitions = Record<string, Record<string, TransitionPair>>;

export const TransitionsSchema = z.object({
  version: z.literal(1),
  layouts: z.record(z.string(), LayoutTransitionsSchema),
});
export type Transitions = z.infer<typeof TransitionsSchema>;

const emaWindow = 20;
const maxNextPerKey = 12;
const maxSpacingFactor = 3;
export const minTransitions = 5;
export const slowRatio = 1.5;

function trimmed(
  row: Record<string, TransitionPair>,
): Record<string, TransitionPair> {
  return Object.fromEntries(
    Object.entries(row)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, maxNextPerKey),
  );
}

/**
 * Folds the gap before each correct keypress into the pair it completes.
 * Space is left out of both halves, since the gap around a word boundary says
 * more about the reader than about the fingers, and a gap measured from a key
 * the typist got wrong belongs to the mistake rather than to the pair.
 */
export function applyTransitions(
  current: LayoutTransitions,
  samples: KeySample[],
): LayoutTransitions {
  const next: LayoutTransitions = { ...current };
  const touched = new Set<string>();
  let afterWrong = false;
  for (const sample of samples) {
    const { prev, spacingMs, keycode } = sample;
    const wrongBefore = afterWrong;
    afterWrong = !sample.correct;
    if (!sample.correct || sample.recovery === true || wrongBefore) continue;
    if (prev === undefined || spacingMs === undefined) continue;
    if (prev === "Space" || keycode === "Space") continue;
    const row = { ...next[prev] };
    const pair = row[keycode] ?? { emaMs: 0, count: 0 };
    // one hesitation should not own a pair, as in the per key stats
    const capped =
      pair.count === 0
        ? spacingMs
        : Math.min(spacingMs, pair.emaMs * maxSpacingFactor);
    const count = pair.count + 1;
    row[keycode] = {
      emaMs: pair.emaMs + (capped - pair.emaMs) / Math.min(count, emaWindow),
      count,
    };
    next[prev] = row;
    touched.add(prev);
  }
  for (const prev of touched) next[prev] = trimmed(next[prev] ?? {});
  return next;
}

export type TransitionKind = "same finger" | "same hand" | "alternating";

function hand(finger: Finger): "L" | "R" | undefined {
  if (finger === "thumb") return undefined;
  return finger.startsWith("L") ? "L" : "R";
}

export function classifyTransition(
  prev: Keycode,
  key: Keycode,
): TransitionKind {
  const before = keycodeToFinger[prev];
  const after = keycodeToFinger[key];
  if (before === undefined || after === undefined) return "alternating";
  if (before === after) return "same finger";
  const side = hand(before);
  return side !== undefined && side === hand(after)
    ? "same hand"
    : "alternating";
}

export type Transition = {
  prev: Keycode;
  key: Keycode;
  emaMs: number;
  count: number;
  /** emaMs over the layout median, so 1.5 is half again as slow */
  ratio: number;
  kind: TransitionKind;
};

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * The pairs worth naming: one hand carries both keys and the gap is at least
 * half again the layout's median pair. An alternating pair is fast by nature,
 * so it only serves to set the median it is measured against.
 */
export function worstTransitions(
  stats: LayoutTransitions,
  count: number,
  minCount = minTransitions,
): Transition[] {
  const seen: { prev: Keycode; key: Keycode; pair: TransitionPair }[] = [];
  for (const [prev, row] of Object.entries(stats) as [
    Keycode,
    Record<string, TransitionPair>,
  ][]) {
    for (const [key, pair] of Object.entries(row) as [
      Keycode,
      TransitionPair,
    ][]) {
      if (pair.count >= minCount) seen.push({ prev, key, pair });
    }
  }
  const typical = median(seen.map(({ pair }) => pair.emaMs));
  if (typical === undefined || typical === 0) return [];
  return seen
    .map(({ prev, key, pair }) => ({
      prev,
      key,
      emaMs: pair.emaMs,
      count: pair.count,
      ratio: pair.emaMs / typical,
      kind: classifyTransition(prev, key),
    }))
    .filter(
      (transition) =>
        transition.kind !== "alternating" && transition.ratio >= slowRatio,
    )
    .sort((a, b) => b.ratio - a.ratio || b.count - a.count)
    .slice(0, count);
}

const emptyTransitions = (): Transitions => ({ version: 1, layouts: {} });

const [transitions, setTransitions, wroteTransitions] =
  useLocalStorage<Transitions>({
    key: "trainerTransitions",
    schema: TransitionsSchema,
    fallback: emptyTransitions(),
  });

export function getLayoutTransitions(layoutName: string): LayoutTransitions {
  return transitions().layouts[layoutName] ?? {};
}

export function recordTransitions(
  layoutName: string,
  samples: KeySample[],
): void {
  setTransitions((current) => ({
    version: 1,
    layouts: {
      ...current.layouts,
      [layoutName]: applyTransitions(
        current.layouts[layoutName] ?? {},
        samples,
      ),
    },
  }));
}

export function getTransitions(): Transitions {
  return transitions();
}

export function resetTransitions(): void {
  setTransitions(emptyTransitions());
}

// the cap lives on the record path, so an import applies it to what it carries
export function replaceTransitions(data: Transitions): boolean {
  const layouts: Transitions["layouts"] = {};
  for (const [layout, rows] of Object.entries(data.layouts)) {
    const next: LayoutTransitions = {};
    for (const [from, row] of Object.entries(rows)) next[from] = trimmed(row);
    layouts[layout] = next;
  }
  setTransitions({ ...data, layouts });
  return wroteTransitions();
}
