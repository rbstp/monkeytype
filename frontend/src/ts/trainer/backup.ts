import { z } from "zod";
import {
  ConfusionsSchema,
  getConfusions,
  replaceConfusions,
} from "./confusions";
import { getKeyHistory, KeyHistorySchema, replaceKeyHistory } from "./history";
import {
  getKeyStats,
  KeyStatsSchema,
  KeyStatsV1Schema,
  replaceKeyStats,
  upgradeKeyStats,
} from "./key-stats";
import {
  progress,
  ProgressSchema,
  ProgressV1Schema,
  ProgressV2Schema,
  replaceProgress,
  upgradeProgress,
} from "./lessons";
import {
  getTransitions,
  replaceTransitions,
  TransitionsSchema,
} from "./transitions";

export const BackupSchema = z.object({
  version: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ])
    .transform(() => 6 as const),
  keyStats: z.union([
    KeyStatsSchema,
    KeyStatsV1Schema.transform(upgradeKeyStats),
  ]),
  progress: z.union([
    ProgressSchema,
    ProgressV2Schema.transform(upgradeProgress),
    ProgressV1Schema.transform(upgradeProgress),
  ]),
  confusions: ConfusionsSchema.optional(),
  transitions: TransitionsSchema.optional(),
  keyHistory: KeyHistorySchema.optional(),
});
export type Backup = z.infer<typeof BackupSchema>;

export function exportBackup(): string {
  const backup: Backup = {
    version: 6,
    keyStats: getKeyStats(),
    progress: progress(),
    confusions: getConfusions(),
    transitions: getTransitions(),
    keyHistory: getKeyHistory(),
  };
  return JSON.stringify(backup);
}

export function parseBackup(json: string): Backup | undefined {
  try {
    const parsed = BackupSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function importParsedBackup(backup: Backup): boolean {
  // every store is written, then the refusals are counted, so a full store is
  // reported as the failure it is instead of a success it does not hold
  return [
    replaceKeyStats(backup.keyStats),
    replaceProgress(backup.progress),
    replaceConfusions(backup.confusions ?? { version: 1, layouts: {} }),
    replaceTransitions(backup.transitions ?? { version: 1, layouts: {} }),
    replaceKeyHistory(backup.keyHistory ?? { version: 1, layouts: {} }),
  ].every(Boolean);
}

export function importBackup(json: string): boolean {
  const backup = parseBackup(json);
  return backup !== undefined && importParsedBackup(backup);
}
