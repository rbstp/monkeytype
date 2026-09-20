import { z } from "zod";
import { LayoutName, LayoutObject } from "@monkeytype/schemas/layouts";
import { Keycode } from "../constants/keys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { EventLog } from "../test/events/types";
import { findLayoutKey } from "../utils/key-converter";
import { Finger, FINGERS, isShiftedLayer, keycodeToFinger } from "./finger";

const KeyStatSchema = z.object({
  ema: z.number().nonnegative(),
  total: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  lastSeen: z.number().nonnegative(),
});
export type KeyStat = z.infer<typeof KeyStatSchema>;

const LayoutStatsSchema = z.record(z.string(), KeyStatSchema);
export type LayoutStats = Partial<Record<Keycode, KeyStat>>;

export const KeyStatsSchema = z.object({
  version: z.literal(1),
  layouts: z.record(z.string(), LayoutStatsSchema),
});
export type KeyStats = z.infer<typeof KeyStatsSchema>;

const emaWindow = 50;
const errorPenaltyMs = 5000;
const minSamplesForRanking = 5;

export type KeySample = {
  keycode: Keycode;
  shifted: boolean;
  correct: boolean;
  spacingMs?: number;
};

export function layoutStatsName(layout: LayoutName, funbox: string[]): string {
  return funbox.includes("layout_mirror") ? `${layout}_mirrored` : layout;
}

/**
 * Turns the input events of a finished test into per keycode samples.
 * Stopped inputs count as errors. Extra characters past the end of a word are ignored.
 */
export function samplesFromEventLog(
  eventLog: EventLog,
  layout: LayoutObject,
): KeySample[] {
  const samples: KeySample[] = [];
  let previousMs: number | undefined;

  for (const event of eventLog.events) {
    if (event.type !== "input" || !("correct" in event.data)) continue;
    if (event.data.automatic) continue;

    const spacingMs =
      previousMs === undefined ? undefined : event.testMs - previousMs;
    previousMs = event.testMs;

    const expected =
      eventLog.context.targetWords[event.data.wordIndex]?.[
        event.data.charIndex
      ];
    if (expected === undefined) continue;
    if (expected === " " && event.data.commitsWord !== true) continue;

    const found = findLayoutKey(expected, layout);
    if (found === undefined) continue;

    samples.push({
      keycode: found.keycode,
      shifted: isShiftedLayer(found.layer),
      correct: event.data.correct,
      ...(spacingMs !== undefined ? { spacingMs } : {}),
    });
  }

  return samples;
}

function updateStat(stat: KeyStat, sample: KeySample, now: number): KeyStat {
  const total = stat.total + 1;
  const penalty = sample.correct ? 0 : errorPenaltyMs;
  const score = (sample.spacingMs ?? stat.ema) + penalty;
  const ema = stat.ema + (score - stat.ema) / Math.min(total, emaWindow);
  return {
    ema,
    total,
    errors: stat.errors + (sample.correct ? 0 : 1),
    lastSeen: now,
  };
}

export function applySamples(
  stats: LayoutStats,
  samples: KeySample[],
  now: number,
): LayoutStats {
  const next: LayoutStats = { ...stats };
  for (const sample of samples) {
    const current = next[sample.keycode] ?? {
      ema: 0,
      total: 0,
      errors: 0,
      lastSeen: now,
    };
    next[sample.keycode] = updateStat(current, sample, now);
  }
  return next;
}

export type RankedKey = { keycode: Keycode; finger?: Finger } & KeyStat;

export function worstKeys(stats: LayoutStats, count: number): RankedKey[] {
  return (Object.entries(stats) as [Keycode, KeyStat][])
    .filter(([, stat]) => stat.total >= minSamplesForRanking)
    .map(([keycode, stat]) => ({
      keycode,
      ...stat,
      ...(keycodeToFinger[keycode] === undefined
        ? {}
        : { finger: keycodeToFinger[keycode] }),
    }))
    .sort((a, b) => b.ema - a.ema)
    .slice(0, count);
}

export type FingerSummary = { total: number; errors: number; avgMs: number };

export function fingerSummary(
  stats: LayoutStats,
): Record<Finger, FingerSummary> {
  const summary = Object.fromEntries(
    FINGERS.map((finger) => [finger, { total: 0, errors: 0, avgMs: 0 }]),
  ) as Record<Finger, FingerSummary>;
  const emaSum: Record<Finger, number> = Object.fromEntries(
    FINGERS.map((finger) => [finger, 0]),
  ) as Record<Finger, number>;

  for (const [keycode, stat] of Object.entries(stats) as [Keycode, KeyStat][]) {
    const finger = keycodeToFinger[keycode];
    if (finger === undefined) continue;
    summary[finger].total += stat.total;
    summary[finger].errors += stat.errors;
    emaSum[finger] += stat.ema * stat.total;
  }
  for (const finger of FINGERS) {
    const total = summary[finger].total;
    summary[finger].avgMs = total === 0 ? 0 : emaSum[finger] / total;
  }
  return summary;
}

export function accuracy(stat: { total: number; errors: number }): number {
  return stat.total === 0 ? 0 : ((stat.total - stat.errors) / stat.total) * 100;
}

const [keyStats, setKeyStats] = useLocalStorage<KeyStats>({
  key: "trainerKeyStats",
  schema: KeyStatsSchema,
  fallback: { version: 1, layouts: {} },
});

export function getLayoutStats(layoutName: string): LayoutStats {
  return keyStats().layouts[layoutName] ?? {};
}

export function recordSamples(layoutName: string, samples: KeySample[]): void {
  if (samples.length === 0) return;
  const now = Date.now();
  setKeyStats((current) => ({
    version: 1,
    layouts: {
      ...current.layouts,
      [layoutName]: applySamples(
        current.layouts[layoutName] ?? {},
        samples,
        now,
      ),
    },
  }));
}

export function resetKeyStats(): void {
  setKeyStats({ version: 1, layouts: {} });
}

export function getKeyStats(): KeyStats {
  return keyStats();
}

export function replaceKeyStats(data: KeyStats): void {
  setKeyStats(data);
}
