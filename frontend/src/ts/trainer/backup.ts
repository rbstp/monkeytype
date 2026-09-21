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

export const BackupSchema = z.object({
  version: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ])
    .transform(() => 5 as const),
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
  keyHistory: KeyHistorySchema.optional(),
});
export type Backup = z.infer<typeof BackupSchema>;

export function exportBackup(): string {
  const backup: Backup = {
    version: 5,
    keyStats: getKeyStats(),
    progress: progress(),
    confusions: getConfusions(),
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

export function importBackup(json: string): boolean {
  const backup = parseBackup(json);
  if (backup === undefined) return false;
  replaceKeyStats(backup.keyStats);
  replaceProgress(backup.progress);
  replaceConfusions(backup.confusions ?? { version: 1, layouts: {} });
  replaceKeyHistory(backup.keyHistory ?? { version: 1, layouts: {} });
  return true;
}
