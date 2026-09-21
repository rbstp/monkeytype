import { createMemo, JSXElement, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { restartTestEvent } from "../../../events/test";
import { getLastResult, inputLayoutObject } from "../../../states/test";
import { beginLesson } from "../../../trainer/actions";
import {
  criteriaFor,
  Lesson,
  lessonKeyLegend,
  lessonName,
  lessonNumber,
  LESSONS,
  masteryErrorRate,
  nextLesson,
  progress,
  progressLayout,
  unlockedUpTo,
  unlockStatus,
  WeakKey,
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

  const legend = (key: WeakKey): string => {
    const layout = inputLayoutObject();
    const lesson = active()?.lesson;
    const label =
      layout === undefined || lesson === undefined
        ? undefined
        : lessonKeyLegend(lesson, key.keycode, layout);
    return label ?? key.keycode;
  };

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
    const latest = attempts
      .filter(
        (attempt) =>
          attempt.lesson === current.lesson.id && attempt.layout === layout,
      )
      .pop();
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
    if (status.wpmShort > 0) {
      return `${Math.round(latest.wpm)} wpm, ${status.wpmShort} short of ${criteria.minWpm}`;
    }
    if (status.accShort > 0) {
      return `accuracy ${Math.floor(latest.acc)}%, ${status.accShort} short of ${criteria.minAcc}%`;
    }
    const weak = status.weakKeys[0];
    if (weak === undefined) return "passed the bar, pass once more to unlock";
    if (weak.samples < weak.required) {
      return `passed the bar, ${legend(weak)} needs ${weak.required - weak.samples} more samples`;
    }
    return `passed the bar, ${legend(weak)} has ${weak.errors} errors in ${weak.samples} samples, above ${masteryErrorRate * 100}%`;
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
