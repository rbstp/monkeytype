import { createMemo, For, JSXElement, Show } from "solid-js";

import { navigate } from "../../controllers/route-controller";
import { hideModalAndClearChain } from "../../states/modals";
import { inputLayoutObject } from "../../states/test";
import { beginLesson } from "../../trainer/actions";
import { LessonState, lessonState } from "../../trainer/lesson-state";
import {
  bestOf,
  Lesson,
  lessonAvailable,
  lessonName,
  lessonNumber,
  LESSONS,
  progressLayout,
} from "../../trainer/lessons";
import { cn } from "../../utils/cn";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";

const close = (): void => hideModalAndClearChain("lessonPicker");

export function LessonPickerModal(): JSXElement {
  const shown = createMemo((): { lesson: Lesson; index: number }[] =>
    LESSONS.map((lesson, index) => ({ lesson, index })).filter(({ lesson }) =>
      lessonAvailable(lesson, progressLayout()),
    ),
  );

  return (
    <AnimatedModal
      id="lessonPicker"
      title="pick a lesson"
      modalClass="max-w-[600px]"
    >
      <div class="grid max-h-[60vh] gap-1 overflow-y-auto">
        <For each={shown()}>
          {({ lesson, index }) => {
            const state = (): LessonState => lessonState(index);
            const locked = (): boolean => state() === "locked";
            const best = (): number | undefined => bestOf(lesson.id);
            return (
              <button
                type="button"
                disabled={locked()}
                data-testid="lessonPickerRow"
                data-lesson-state={state()}
                class={cn(
                  "grid grid-cols-[2rem_1fr_auto] items-center gap-4 rounded bg-sub-alt px-4 py-3 text-left text-text transition-colors duration-125",
                  {
                    "cursor-pointer hover:bg-text hover:text-bg": !locked(),
                    "cursor-default opacity-50": locked(),
                    "bg-main text-bg": state() === "active",
                  },
                )}
                onClick={() => {
                  close();
                  void beginLesson(index);
                }}
              >
                <span>{lessonNumber(index, progressLayout())}</span>
                <span>{lessonName(lesson, inputLayoutObject())}</span>
                <span class="text-sm">
                  <Show when={best()} fallback={state()}>
                    {(wpm) => <>best {Math.round(wpm())}</>}
                  </Show>
                </span>
              </button>
            );
          }}
        </For>
      </div>
      <Button
        fa={{ icon: "fa-graduation-cap" }}
        text="open the trainer page"
        variant="text"
        onClick={() => {
          close();
          void navigate("/trainer");
        }}
      />
    </AnimatedModal>
  );
}
