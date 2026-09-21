import { createMemo, JSXElement, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { restartTestEvent } from "../../../events/test";
import { getLastResult, inputLayoutObject } from "../../../states/test";
import { beginLesson } from "../../../trainer/actions";
import {
  criteriaFor,
  latestAttempt,
  Lesson,
  lessonName,
  lessonNumber,
  LESSONS,
  nextLesson,
  progress,
  progressLayout,
  unlockBlocker,
  unlockedUpTo,
  unlockStatus,
} from "../../../trainer/lessons";
import { getActiveLesson } from "../../../trainer/session";
import { Button } from "../../common/Button";

type Active = { index: number; lesson: Lesson };

export function LessonResultCard(): JSXElement {
  const active = createMemo((): Active | undefined => {
    const index = getActiveLesson();
    const lesson = index === null ? undefined : LESSONS[index];
    return index === null || lesson === undefined
      ? undefined
      : { index, lesson };
  });

  const next = (): number | undefined => {
    const current = active();
    return current === undefined
      ? undefined
      : nextLesson(current.index, progressLayout());
  };
  const hasNext = (): boolean => next() !== undefined;
  const locked = (): boolean => unlockedUpTo() < (next() ?? Infinity);

  const line = createMemo((): string => {
    const current = active();
    const result = getLastResult();
    if (current === undefined || result === null) return "";
    const criteria = criteriaFor(getConfig.trainerUnlock);
    const layout = progressLayout();
    const attempts = progress().attempts;
    const latest = latestAttempt(attempts, current.lesson.id, layout);
    if (latest === undefined || latest.ts < result.timestamp) {
      return "attempt not recorded";
    }
    const status = unlockStatus(attempts, current.lesson.id, layout, criteria);
    if (status.ok) {
      const index = next();
      const following = index === undefined ? undefined : LESSONS[index];
      return index === undefined || following === undefined
        ? "lesson passed"
        : `lesson ${lessonNumber(index, layout)} unlocked: ${lessonName(following, inputLayoutObject())}`;
    }
    return unlockBlocker(
      status,
      latest,
      criteria,
      current.lesson,
      inputLayoutObject(),
    );
  });

  return (
    <Show when={line() !== ""}>
      <div
        data-testid="lessonresult"
        class="col-span-full flex flex-wrap items-center justify-between gap-4 rounded bg-sub-alt p-4 text-sub"
      >
        <span>{line()}</span>
        <span class="flex gap-2">
          <Button
            fa={{ icon: "fa-redo" }}
            text="retry"
            class="px-4 py-2"
            onClick={() => restartTestEvent.dispatch()}
          />
          <Show when={hasNext()}>
            <Button
              fa={{ icon: "fa-arrow-right" }}
              text="next"
              class="px-4 py-2"
              disabled={locked()}
              onClick={() => void beginLesson(next() ?? 0)}
            />
          </Show>
        </span>
      </div>
    </Show>
  );
}
