import { createMemo } from "solid-js";

import { getConfig } from "../../../../config/store";
import { showModal } from "../../../../states/modals";
import { inputLayoutObject } from "../../../../states/test";
import {
  bestOf,
  criteriaFor,
  lessonName,
  lessonNumber,
  LESSONS,
  progress,
  progressLayout,
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
    const parts = [
      `lesson ${lessonNumber(index, progressLayout())}: ${lessonName(lesson, inputLayoutObject())}`,
    ];
    const best = bestOf(lesson.id);
    if (best !== undefined) parts.push(`best ${Math.round(best)}`);
    const criteria = criteriaFor(getConfig.trainerUnlock);
    const { phase } = unlockStatus(
      progress().attempts,
      lesson.id,
      progressLayout(),
      criteria,
    );
    parts.push(
      phase === "speed"
        ? `speed phase · target ${criteria.minWpm} wpm`
        : `accuracy phase · target ${criteria.minAcc}%`,
    );
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
