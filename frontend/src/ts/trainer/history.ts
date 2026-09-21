import { z } from "zod";
import { Keycode } from "../constants/keys";
import { useLocalStorage } from "../hooks/useLocalStorage";

const SnapshotStatSchema = z.object({
  emaMs: z.number().nonnegative(),
  errRate: z.number().min(0).max(1),
  total: z.number().int().nonnegative(),
});
export type SnapshotStat = z.infer<typeof SnapshotStatSchema>;

const DaySchema = z.record(z.string(), SnapshotStatSchema);
export type DaySnapshot = Record<string, SnapshotStat>;

const LayoutHistorySchema = z.record(z.string(), DaySchema);
export type LayoutHistory = Record<string, DaySnapshot>;

export const KeyHistorySchema = z.object({
  version: z.literal(1),
  layouts: z.record(z.string(), LayoutHistorySchema),
});
export type KeyHistory = z.infer<typeof KeyHistorySchema>;

const keptDays = 90;
const deltaAfterDays = 7;
const minNewSamples = 20;
const minMovement = 0.15;

export function dayOf(time: number): string {
  const date = new Date(time);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// calendar days, so a DST change never moves the prune or the cutoff a day
export function daysBefore(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const shifted = new Date(year, month - 1, date);
  shifted.setDate(shifted.getDate() - days);
  return dayOf(shifted.getTime());
}

export function withSnapshot(
  history: LayoutHistory,
  stats: Record<string, SnapshotStat>,
  day: string,
): LayoutHistory {
  const oldest = daysBefore(day, keptDays);
  const next: LayoutHistory = {};
  for (const [date, snapshot] of Object.entries(history)) {
    if (date >= oldest && date !== day) next[date] = snapshot;
  }
  const today: DaySnapshot = {};
  for (const [keycode, stat] of Object.entries(stats)) {
    today[keycode] = {
      emaMs: stat.emaMs,
      errRate: stat.errRate,
      total: stat.total,
    };
  }
  next[day] = today;
  return next;
}

export type KeyDelta = {
  keycode: Keycode;
  /** positive when the key got slower */
  ms: number;
  since: string;
};

// the newest snapshot at least a week old, so a delta always spans real practice
export function keyDeltas(
  history: LayoutHistory,
  stats: Record<string, SnapshotStat>,
  today: string,
): KeyDelta[] {
  const cutoff = daysBefore(today, deltaAfterDays);
  const since = Object.keys(history)
    .filter((date) => date <= cutoff)
    .sort()
    .pop();
  if (since === undefined) return [];
  const snapshot = history[since] ?? {};
  const deltas: KeyDelta[] = [];
  for (const [keycode, stat] of Object.entries(stats) as [
    Keycode,
    SnapshotStat,
  ][]) {
    const before = snapshot[keycode];
    if (before === undefined || before.emaMs === 0) continue;
    if (stat.total - before.total < minNewSamples) continue;
    const ms = stat.emaMs - before.emaMs;
    if (Math.abs(ms) / before.emaMs < minMovement) continue;
    deltas.push({ keycode, ms, since });
  }
  return deltas.sort((a, b) => Math.abs(b.ms) - Math.abs(a.ms));
}

const emptyHistory = (): KeyHistory => ({ version: 1, layouts: {} });

const [keyHistory, setKeyHistory, wroteKeyHistory] =
  useLocalStorage<KeyHistory>({
    key: "trainerKeyHistory",
    schema: KeyHistorySchema,
    fallback: emptyHistory(),
  });

export function getLayoutHistory(layoutName: string): LayoutHistory {
  return keyHistory().layouts[layoutName] ?? {};
}

export function recordSnapshot(
  layoutName: string,
  stats: Record<string, SnapshotStat>,
  now: number,
): void {
  setKeyHistory((current) => ({
    version: 1,
    layouts: {
      ...current.layouts,
      [layoutName]: withSnapshot(
        current.layouts[layoutName] ?? {},
        stats,
        dayOf(now),
      ),
    },
  }));
}

export function getKeyHistory(): KeyHistory {
  return keyHistory();
}

export function resetKeyHistory(): void {
  setKeyHistory(emptyHistory());
}

export function replaceKeyHistory(data: KeyHistory): boolean {
  setKeyHistory(data);
  return wroteKeyHistory();
}
