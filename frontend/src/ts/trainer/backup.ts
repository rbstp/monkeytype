import { z } from "zod";
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
  replaceProgress,
  upgradeProgress,
} from "./lessons";

export const BackupSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]).transform(() => 2 as const),
  keyStats: z.union([
    KeyStatsSchema,
    KeyStatsV1Schema.transform(upgradeKeyStats),
  ]),
  progress: z.union([
    ProgressSchema,
    ProgressV1Schema.transform(upgradeProgress),
  ]),
});
export type Backup = z.infer<typeof BackupSchema>;

export function exportBackup(): string {
  const backup: Backup = {
    version: 2,
    keyStats: getKeyStats(),
    progress: progress(),
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
  return true;
}
