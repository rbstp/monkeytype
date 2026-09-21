import { z } from "zod";
import { LayoutName, LayoutObject } from "@monkeytype/schemas/layouts";
import { Keycode } from "../constants/keys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { EventLog } from "../test/events/types";
import { findLayoutKey } from "../utils/key-converter";
import { deadKeyFor } from "./dead-keys";
import { Finger, FINGERS, isShiftedLayer, keycodeToFinger } from "./finger";

const KeyStatSchema = z.object({
  emaMs: z.number().nonnegative(),
  timed: z.number().int().nonnegative(),
  errRate: z.number().min(0).max(1),
  total: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  lastSeen: z.number().nonnegative(),
});
export type KeyStat = z.infer<typeof KeyStatSchema>;

const LayoutStatsSchema = z.record(z.string(), KeyStatSchema);
export type LayoutStats = Partial<Record<Keycode, KeyStat>>;

export const KeyStatsSchema = z.object({
  version: z.literal(2),
  layouts: z.record(z.string(), LayoutStatsSchema),
});
export type KeyStats = z.infer<typeof KeyStatsSchema>;

export const KeyStatsV1Schema = z.object({
  version: z.literal(1),
  layouts: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        ema: z.number().nonnegative(),
        total: z.number().int().nonnegative(),
        errors: z.number().int().nonnegative(),
        lastSeen: z.number().nonnegative(),
      }),
    ),
  ),
});
export type KeyStatsV1 = z.infer<typeof KeyStatsV1Schema>;

const emaWindow = 50;
const v1ErrorPenaltyMs = 5000;
const maxSpacingFactor = 3;
const minSamplesForRanking = 5;
const slowMs = 600;
const errorProneRate = 0.1;

export type KeySample = {
  keycode: Keycode;
  shifted: boolean;
  correct: boolean;
  spacingMs?: number;
  recovery?: true;
};

const emptyStat = (now: number): KeyStat => ({
  emaMs: 0,
  timed: 0,
  errRate: 0,
  total: 0,
  errors: 0,
  lastSeen: now,
});

export function layoutStatsName(layout: LayoutName, funbox: string[]): string {
  return funbox.includes("layout_mirror") ? `${layout}_mirrored` : layout;
}

/**
 * Turns the input events of a finished test into per keycode samples.
 * Stopped inputs count as errors. Extra characters past the end of a word are
 * ignored. Deletes advance the clock and mark the next insert as a recovery,
 * so the time spent fixing a typo is not charged to the key typed after it.
 * A dead-key pair arrives as one input, so only the dead key carries the
 * spacing.
 */
export function samplesFromEventLog(
  eventLog: EventLog,
  layout: LayoutObject,
): KeySample[] {
  const samples: KeySample[] = [];
  let previousMs: number | undefined;
  let recovering = false;

  for (const event of eventLog.events) {
    if (event.type !== "input") continue;
    if (!("correct" in event.data)) {
      previousMs = event.testMs;
      recovering = true;
      continue;
    }
    if (event.data.automatic) continue;

    const spacingMs =
      previousMs === undefined ? undefined : event.testMs - previousMs;
    previousMs = event.testMs;
    const recovery = recovering;
    recovering = false;

    const expected =
      eventLog.context.targetWords[event.data.wordIndex]?.[
        event.data.charIndex
      ];
    if (expected === undefined) continue;
    if (expected === " " && event.data.commitsWord !== true) continue;

    const timing: Pick<KeySample, "spacingMs" | "recovery"> = {
      ...(spacingMs !== undefined ? { spacingMs } : {}),
      ...(recovery ? { recovery: true } : {}),
    };
    const found = findLayoutKey(expected, layout);
    if (found !== undefined) {
      samples.push({
        keycode: found.keycode,
        shifted: isShiftedLayer(found.layer),
        correct: event.data.correct,
        ...timing,
      });
      continue;
    }
    const dead = deadKeyFor(expected, layout);
    if (dead === undefined) continue;
    const { spacingMs: _pair, ...untimed } = timing;
    samples.push(
      {
        keycode: dead.dead,
        shifted: isShiftedLayer(dead.deadLayer),
        correct: event.data.correct,
        ...timing,
      },
      {
        keycode: dead.base,
        shifted: false,
        correct: event.data.correct,
        ...untimed,
      },
    );
  }

  return samples;
}

function updateStat(stat: KeyStat, sample: KeySample, now: number): KeyStat {
  const total = stat.total + 1;
  const miss = sample.correct ? 0 : 1;
  const errRate =
    stat.errRate + (miss - stat.errRate) / Math.min(total, emaWindow);
  let { emaMs, timed } = stat;
  if (sample.correct && sample.spacingMs !== undefined && !sample.recovery) {
    const capped =
      timed === 0
        ? sample.spacingMs
        : Math.min(sample.spacingMs, emaMs * maxSpacingFactor);
    timed++;
    emaMs += (capped - emaMs) / Math.min(timed, emaWindow);
  }
  return {
    emaMs,
    timed,
    errRate,
    total,
    errors: stat.errors + miss,
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
    next[sample.keycode] = updateStat(
      next[sample.keycode] ?? emptyStat(now),
      sample,
      now,
    );
  }
  return next;
}

export type KeyLabel = "slow" | "error-prone";

export function keyLabel(stat: KeyStat): KeyLabel | undefined {
  if (stat.total >= minSamplesForRanking && stat.errRate >= errorProneRate) {
    return "error-prone";
  }
  if (stat.timed >= minSamplesForRanking && stat.emaMs >= slowMs) return "slow";
  return undefined;
}

export type RankedKey = {
  keycode: Keycode;
  finger?: Finger;
  label?: KeyLabel;
} & KeyStat;

const labelRank: Record<KeyLabel, number> = { "error-prone": 2, slow: 1 };

function rankOf(key: RankedKey): number {
  return key.label === undefined ? 0 : labelRank[key.label];
}

export function worstKeys(stats: LayoutStats, count: number): RankedKey[] {
  return (Object.entries(stats) as [Keycode, KeyStat][])
    .filter(([, stat]) => stat.total >= minSamplesForRanking)
    .map(([keycode, stat]) => {
      const finger = keycodeToFinger[keycode];
      const label = keyLabel(stat);
      return {
        keycode,
        ...stat,
        ...(finger === undefined ? {} : { finger }),
        ...(label === undefined ? {} : { label }),
      };
    })
    .sort(
      (a, b) =>
        rankOf(b) - rankOf(a) || b.errRate - a.errRate || b.emaMs - a.emaMs,
    )
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
  const timed: Record<Finger, number> = Object.fromEntries(
    FINGERS.map((finger) => [finger, 0]),
  ) as Record<Finger, number>;

  for (const [keycode, stat] of Object.entries(stats) as [Keycode, KeyStat][]) {
    const finger = keycodeToFinger[keycode];
    if (finger === undefined) continue;
    summary[finger].total += stat.total;
    summary[finger].errors += stat.errors;
    emaSum[finger] += stat.emaMs * stat.timed;
    timed[finger] += stat.timed;
  }
  for (const finger of FINGERS) {
    const count = timed[finger];
    summary[finger].avgMs = count === 0 ? 0 : emaSum[finger] / count;
  }
  return summary;
}

export function accuracy(stat: { total: number; errors: number }): number {
  return stat.total === 0 ? 0 : ((stat.total - stat.errors) / stat.total) * 100;
}

/**
 * v1 folded a 5000 ms penalty per error into the average, so the speed is
 * recovered by taking that share back out.
 */
export function upgradeKeyStats(v1: KeyStatsV1): KeyStats {
  const layouts: KeyStats["layouts"] = {};
  for (const [layoutName, stats] of Object.entries(v1.layouts)) {
    const upgraded: Record<string, KeyStat> = {};
    for (const [keycode, stat] of Object.entries(stats)) {
      const errRate =
        stat.total === 0 ? 0 : Math.min(1, stat.errors / stat.total);
      upgraded[keycode] = {
        emaMs: Math.max(0, stat.ema - errRate * v1ErrorPenaltyMs),
        timed: Math.max(0, stat.total - stat.errors),
        errRate,
        total: stat.total,
        errors: stat.errors,
        lastSeen: stat.lastSeen,
      };
    }
    layouts[layoutName] = upgraded;
  }
  return { version: 2, layouts };
}

const emptyKeyStats = (): KeyStats => ({ version: 2, layouts: {} });

const [keyStats, setKeyStats] = useLocalStorage<KeyStats>({
  key: "trainerKeyStats",
  schema: KeyStatsSchema,
  fallback: emptyKeyStats(),
  migrate: (value) => {
    const v1 = KeyStatsV1Schema.safeParse(value);
    return v1.success ? upgradeKeyStats(v1.data) : emptyKeyStats();
  },
});

export function getLayoutStats(layoutName: string): LayoutStats {
  return keyStats().layouts[layoutName] ?? {};
}

export function recordSamples(layoutName: string, samples: KeySample[]): void {
  if (samples.length === 0) return;
  const now = Date.now();
  setKeyStats((current) => ({
    version: 2,
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
  setKeyStats(emptyKeyStats());
}

export function getKeyStats(): KeyStats {
  return keyStats();
}

export function replaceKeyStats(data: KeyStats): void {
  setKeyStats(data);
}
