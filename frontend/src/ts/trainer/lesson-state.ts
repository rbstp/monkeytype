import { currentLesson, unlockedUpTo } from "./lessons";
import { getActiveLesson } from "./session";

export type LessonState = "active" | "current" | "unlocked" | "locked";

export function lessonState(index: number): LessonState {
  if (unlockedUpTo() < index) return "locked";
  if (getActiveLesson() === index) return "active";
  if (currentLesson() === index) return "current";
  return "unlocked";
}
