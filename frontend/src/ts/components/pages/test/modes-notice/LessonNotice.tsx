import { createMemo } from "solid-js";

import { getConfig } from "../../../../config/store";
import { showModal } from "../../../../states/modals";
import { inputLayoutObject } from "../../../../states/test";
import {
  bestOf,
  criteriaFor,
  latestAttempt,
  lessonName,
  lessonNumber,
  LESSONS,
  progress,
  progressLayout,
  unlockBlocker,
  unlockStatus,
} from "../../../../trainer/lessons";
import { getActiveLesson } from "../../../../trainer/session";
import { Notice } from "./Notice";

export function LessonNotice() {
  const text = createMemo(() => {
    const index = getActiveLesson();
    if (index === null) return "";
    const lesson = LESSONS[index];
    if (lesson === undefined) return "";
    const layout = progressLayout();
    const parts = [
      `lesson ${lessonNumber(index, layout)}: ${lessonName(lesson, inputLayoutObject())}`,
    ];
    const best = bestOf(lesson.id);
    if (best !== undefined) parts.push(`best ${Math.round(best)}`);
    const criteria = criteriaFor(getConfig.trainerUnlock);
    const attempts = progress().attempts;
    const blocker = unlockBlocker(
      unlockStatus(attempts, lesson.id, layout, criteria),
      latestAttempt(attempts, lesson.id, layout),
      criteria,
      lesson,
      inputLayoutObject(),
    );
    parts.push(blocker === "" ? "passed" : blocker);
    return parts.join(" · ");
  });

  return (
    <Notice
      when={text() !== ""}
      icon="fa-graduation-cap"
      onClick={() => showModal("lessonPicker")}
      text={text()}
    />
  );
}
