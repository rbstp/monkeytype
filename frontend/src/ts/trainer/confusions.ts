import { z } from "zod";
import { Keycode, qwertyKeycodeKeymap } from "../constants/keys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { keycodeToFinger } from "./finger";
import { KeySample } from "./key-stats";

const LayoutConfusionsSchema = z.record(
  z.string(),
  z.record(z.string(), z.number().int().nonnegative()),
);
export type LayoutConfusions = Record<string, Record<string, number>>;

export const ConfusionsSchema = z.object({
  version: z.literal(1),
  layouts: z.record(z.string(), LayoutConfusionsSchema),
});
export type Confusions = z.infer<typeof ConfusionsSchema>;

const maxTypedPerKey = 8;
const decayAbove = 200;
export const minConfusions = 3;

function topTyped(row: Record<string, number>): [string, number][] {
  return Object.entries(row)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxTypedPerKey);
}

function trimmed(row: Record<string, number>): Record<string, number> {
  let entries = Object.entries(row).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total > decayAbove) {
    entries = entries
      .map(([typed, count]): [string, number] => [typed, Math.floor(count / 2)])
      .filter(([, count]) => count > 0);
  }
  return Object.fromEntries(entries.slice(0, maxTypedPerKey));
}

// the cap lives on the record path, so an import applies it to what it carries
function capped(data: Confusions): Confusions {
  const layouts: Confusions["layouts"] = {};
  for (const [layout, rows] of Object.entries(data.layouts)) {
    const next: LayoutConfusions = {};
    for (const [expected, row] of Object.entries(rows)) {
      next[expected] = Object.fromEntries(topTyped(row));
    }
    layouts[layout] = next;
  }
  return { ...data, layouts };
}

// halving past 200 lets old habits fade instead of pruning them by a rule
export function applyConfusions(
  current: LayoutConfusions,
  samples: KeySample[],
): LayoutConfusions {
  const next: LayoutConfusions = { ...current };
  const touched = new Set<string>();
  for (const sample of samples) {
    if (sample.correct || sample.typed === undefined) continue;
    if (sample.typed === sample.keycode) continue;
    const row = { ...next[sample.keycode] };
    row[sample.typed] = (row[sample.typed] ?? 0) + 1;
    next[sample.keycode] = row;
    touched.add(sample.keycode);
  }
  // the cap applies per test, so a slip repeated in one test can outrank an old one
  for (const keycode of touched) next[keycode] = trimmed(next[keycode] ?? {});
  return next;
}

export type ConfusionKind =
  | "same finger"
  | "mirror hand"
  | "neighbour"
  | "other";

function positionOf(
  keycode: Keycode,
): { row: number; column: number } | undefined {
  for (const [row, keys] of qwertyKeycodeKeymap.entries()) {
    const column = keys.indexOf(keycode);
    if (column !== -1) return { row, column };
  }
  return undefined;
}

export function classifyConfusion(
  expected: Keycode,
  typed: Keycode,
): ConfusionKind {
  const wanted = keycodeToFinger[expected];
  const pressed = keycodeToFinger[typed];
  if (wanted !== undefined && pressed !== undefined) {
    if (wanted === pressed) return "same finger";
    if (wanted.slice(1) === pressed.slice(1) && wanted !== "thumb") {
      return "mirror hand";
    }
  }
  const a = positionOf(expected);
  const b = positionOf(typed);
  if (
    a !== undefined &&
    b !== undefined &&
    Math.abs(a.row - b.row) <= 1 &&
    Math.abs(a.column - b.column) <= 1
  ) {
    return "neighbour";
  }
  return "other";
}

export type Confusion = {
  expected: Keycode;
  typed: Keycode;
  count: number;
  kind: ConfusionKind;
};

export function worstConfusions(
  stats: LayoutConfusions,
  count: number,
  min = minConfusions,
): Confusion[] {
  const all: Confusion[] = [];
  for (const [expected, row] of Object.entries(stats) as [
    Keycode,
    Record<string, number>,
  ][]) {
    for (const [typed, seen] of Object.entries(row) as [Keycode, number][]) {
      if (seen < min) continue;
      all.push({
        expected,
        typed,
        count: seen,
        kind: classifyConfusion(expected, typed),
      });
    }
  }
  return all.sort((a, b) => b.count - a.count).slice(0, count);
}

const emptyConfusions = (): Confusions => ({ version: 1, layouts: {} });

const [confusions, setConfusions, wroteConfusions] =
  useLocalStorage<Confusions>({
    key: "trainerConfusions",
    schema: ConfusionsSchema,
    fallback: emptyConfusions(),
  });

export function getLayoutConfusions(layoutName: string): LayoutConfusions {
  return confusions().layouts[layoutName] ?? {};
}

export function recordConfusions(
  layoutName: string,
  samples: KeySample[],
): void {
  if (!samples.some((sample) => !sample.correct)) return;
  setConfusions((current) => ({
    version: 1,
    layouts: {
      ...current.layouts,
      [layoutName]: applyConfusions(current.layouts[layoutName] ?? {}, samples),
    },
  }));
}

export function getConfusions(): Confusions {
  return confusions();
}

export function resetConfusions(): void {
  setConfusions(emptyConfusions());
}

export function replaceConfusions(data: Confusions): boolean {
  setConfusions(capped(data));
  return wroteConfusions();
}
