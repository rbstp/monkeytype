import { z } from "zod";
import { getKeyStats, KeyStatsSchema, replaceKeyStats } from "./key-stats";
import { progress, ProgressSchema, replaceProgress } from "./lessons";

export const BackupSchema = z.object({
  version: z.literal(1),
  keyStats: KeyStatsSchema,
  progress: ProgressSchema,
});
export type Backup = z.infer<typeof BackupSchema>;

export function exportBackup(): string {
  const backup: Backup = {
    version: 1,
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
