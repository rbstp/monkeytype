import { createMemo } from "solid-js";

import { getConfig } from "../../../../config/store";
import { navigate } from "../../../../controllers/route-controller";
import { inputLayoutObject } from "../../../../states/test";
import {
  bestOf,
  criteriaFor,
  lessonName,
  lessonNumber,
  LESSONS,
  progressLayout,
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
    parts.push(`target ${criteria.minWpm} / ${criteria.minAcc}%`);
    return parts.join(" · ");
  });

  return (
    <Notice
      when={text() !== ""}
      icon="fa-graduation-cap"
      onClick={() => void navigate("/trainer")}
      text={text()}
    />
  );
}
