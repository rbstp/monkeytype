import { For, JSXElement, Show } from "solid-js";

import { inputLayoutObject, isTestActive } from "../../../states/test";
import { beginLesson } from "../../../trainer/actions";
import {
  bestWpm,
  lessonChars,
  LESSONS,
  progress,
} from "../../../trainer/lessons";
import { getActiveLesson } from "../../../trainer/session";
import { FaSolidIcon } from "../../../types/font-awesome";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";
import { Fa } from "../../common/Fa";
import { H2 } from "../../common/Headers";
import { Page } from "../../common/Page";

type LessonState = "active" | "current" | "unlocked" | "locked";

function lessonState(index: number): LessonState {
  if (progress().unlocked < index) return "locked";
  if (getActiveLesson() === index) return "active";
  if (progress().current === index) return "current";
  return "unlocked";
}

function stateIcon(state: LessonState, index: number): FaSolidIcon {
  if (state === "active") return "fa-play";
  if (state === "current") return "fa-arrow-right";
  if (state === "locked") return "fa-lock";
  return progress().unlocked > index ? "fa-check" : "fa-unlock";
}

export function TrainerPage(): JSXElement {
  const currentName = (): string => LESSONS[progress().current]?.name ?? "";

  const legends = (index: number): string => {
    const layout = inputLayoutObject();
    if (layout === undefined) return "";
    return lessonChars(index, layout).fresh.join(" ");
  };

  const bestLabel = (index: number): string => {
    const best = bestWpm(progress().attempts, index);
    return best === undefined ? "" : `best ${Math.round(best)} wpm`;
  };

  return (
    <Page id="trainer">
      <div class="grid gap-8">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <H2 text="trainer" fa={{ icon: "fa-graduation-cap" }} class="pb-0" />
          <Button
            fa={{ icon: "fa-play" }}
            text={`continue lesson ${progress().current + 1}: ${currentName()}`}
            disabled={isTestActive()}
            class="px-8 py-4"
            onClick={() => void beginLesson(progress().current)}
          />
        </div>
        <div class="grid gap-2">
          <For each={LESSONS}>
            {(lesson, index) => {
              const state = (): LessonState => lessonState(index());
              const locked = (): boolean => state() === "locked";
              const subClass = (): string =>
                cn("text-sub", {
                  "group-hover:text-bg": !locked(),
                  "text-bg": state() === "active",
                });
              return (
                <button
                  type="button"
                  disabled={locked()}
                  data-lesson-state={state()}
                  class={cn(
                    "group grid grid-cols-[2.5rem_1fr_auto] items-center justify-items-start gap-4 rounded bg-sub-alt p-4 text-left text-text transition-colors duration-125",
                    {
                      "cursor-pointer hover:bg-text hover:text-bg": !locked(),
                      "cursor-default opacity-50": locked(),
                      "bg-main text-bg": state() === "active",
                    },
                  )}
                  onClick={() => {
                    if (!locked()) void beginLesson(index());
                  }}
                >
                  <span class={cn("flex items-center gap-2", subClass())}>
                    <Fa icon={stateIcon(state(), index())} fixedWidth />
                    {index() + 1}
                  </span>
                  <span class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span>{lesson.name}</span>
                    <Show when={legends(index())}>
                      {(text) => (
                        <span class={cn("font-mono", subClass())}>
                          {text()}
                        </span>
                      )}
                    </Show>
                  </span>
                  <Show when={bestLabel(index())}>
                    {(text) => <span class={subClass()}>{text()}</span>}
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </Page>
  );
}
