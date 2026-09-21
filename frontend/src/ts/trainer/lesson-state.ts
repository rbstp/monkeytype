import { LayoutObject } from "@monkeytype/schemas/layouts";
import { getConfig } from "../config/store";
import {
  criteriaFor,
  currentLesson,
  latestAttempt,
  LESSONS,
  progress,
  progressLayout,
  unlockBlocker,
  unlockedUpTo,
  unlockStatus,
} from "./lessons";
import { getActiveLesson } from "./session";

export type LessonState = "active" | "current" | "unlocked" | "locked";

export function lessonState(index: number): LessonState {
  if (unlockedUpTo() < index) return "locked";
  if (getActiveLesson() === index) return "active";
  if (currentLesson() === index) return "current";
  return "unlocked";
}

/**
 * Empty for every lesson but the one being practised: the work is always on
 * that one, and repeating the blocker down the map is noise.
 */
export function lessonBlocker(
  index: number,
  layout: LayoutObject | undefined,
): string {
  const lesson = LESSONS[index];
  if (lesson === undefined || currentLesson() !== index) return "";
  const layoutName = progressLayout();
  const attempts = progress().attempts;
  const criteria = criteriaFor(getConfig.trainerUnlock);
  return unlockBlocker(
    unlockStatus(attempts, lesson.id, layoutName, criteria),
    latestAttempt(attempts, lesson.id, layoutName),
    criteria,
    lesson,
    layout,
  );
}
