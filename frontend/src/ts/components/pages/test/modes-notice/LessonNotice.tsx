import { createMemo } from "solid-js";

import { navigate } from "../../../../controllers/route-controller";
import {
  bestWpm,
  defaultCriteria,
  LESSONS,
  progress,
} from "../../../../trainer/lessons";
import { getActiveLesson } from "../../../../trainer/session";
import { Notice } from "./Notice";

export function LessonNotice() {
  const text = createMemo(() => {
    const index = getActiveLesson();
    if (index === null) return "";
    const lesson = LESSONS[index];
    if (lesson === undefined) return "";
    const parts = [`lesson ${index + 1}: ${lesson.name}`];
    const best = bestWpm(progress().attempts, index);
    if (best !== undefined) parts.push(`best ${Math.round(best)}`);
    parts.push(`target ${defaultCriteria.minWpm} / ${defaultCriteria.minAcc}%`);
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
