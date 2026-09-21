import { createColumnHelper } from "@tanstack/solid-table";
import { ChartData, ChartOptions } from "chart.js";
import { createMemo, For, JSXElement, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { createEffectOn } from "../../../hooks/effects";
import { inputLayoutObject, isTestActive } from "../../../states/test";
import { getTheme } from "../../../states/theme";
import {
  beginLesson,
  exportBackupFile,
  importBackupFile,
  importRequest,
} from "../../../trainer/actions";
import {
  dayOf,
  getLayoutHistory,
  KeyDelta,
  keyDeltas,
} from "../../../trainer/history";
import { getLayoutStats, layoutStatsName } from "../../../trainer/key-stats";
import {
  Attempt,
  bestOf,
  criteriaFor,
  currentLesson,
  Lesson,
  lessonAvailable,
  lessonChars,
  lessonName,
  lessonNumber,
  LESSONS,
  progress,
  progressLayout,
  unlockedUpTo,
} from "../../../trainer/lessons";
import { getActiveLesson } from "../../../trainer/session";
import { FaSolidIcon } from "../../../types/font-awesome";
import { cn } from "../../../utils/cn";
import { keycodeToLayoutKey } from "../../../utils/key-converter";
import { resolveLayoutName } from "../../../utils/layout-name";
import { Button } from "../../common/Button";
import { ChartJs } from "../../common/ChartJs";
import { Fa } from "../../common/Fa";
import { H2 } from "../../common/Headers";
import { Page } from "../../common/Page";
import { DataTable, DataTableColumnDef } from "../../ui/table/DataTable";

type LessonState = "active" | "current" | "unlocked" | "locked";

function lessonState(index: number): LessonState {
  if (unlockedUpTo() < index) return "locked";
  if (getActiveLesson() === index) return "active";
  if (currentLesson() === index) return "current";
  return "unlocked";
}

function stateIcon(state: LessonState, index: number): FaSolidIcon {
  if (state === "active") return "fa-play";
  if (state === "current") return "fa-arrow-right";
  if (state === "locked") return "fa-lock";
  return unlockedUpTo() > index ? "fa-check" : "fa-unlock";
}

type LessonRow = {
  index: number;
  number: number;
  name: string;
  attempts: number;
  best: number | undefined;
  lastWpm: number | undefined;
  lastAcc: number | undefined;
  state: LessonState;
};

const formatNumber = (value: number | undefined, suffix = ""): string =>
  value === undefined ? "" : `${Math.round(value)}${suffix}`;

function lessonColumns(): DataTableColumnDef<LessonRow>[] {
  const defineColumn = createColumnHelper<LessonRow>().accessor;
  return [
    defineColumn("index", {
      header: "lesson",
      cell: (info) => `${info.row.original.number}. ${info.row.original.name}`,
    }),
    defineColumn("attempts", {
      header: "attempts",
      cell: (info) => info.row.original.attempts,
      meta: { align: "right" },
    }),
    defineColumn("best", {
      header: "best",
      cell: (info) => formatNumber(info.row.original.best),
      meta: { align: "right" },
    }),
    defineColumn("lastWpm", {
      header: "last wpm",
      cell: (info) => formatNumber(info.row.original.lastWpm),
      meta: { align: "right" },
    }),
    defineColumn("lastAcc", {
      header: "last acc",
      cell: (info) => formatNumber(info.row.original.lastAcc, "%"),
      meta: { align: "right" },
    }),
    defineColumn("state", {
      header: "state",
      cell: (info) => info.row.original.state,
    }),
  ];
}

function layoutAttempts(): Attempt[] {
  const layout = progressLayout();
  return progress().attempts.filter((attempt) => attempt.layout === layout);
}

function statsName(): string {
  return layoutStatsName(
    resolveLayoutName(getConfig.layout, getConfig.keymapLayout),
    getConfig.funbox,
  );
}

function deltaLine(delta: KeyDelta, legend: string): string {
  const direction = delta.ms > 0 ? "slower" : "faster";
  return `${legend} is ${Math.round(Math.abs(delta.ms))} ms ${direction} than last week`;
}

function AttemptsChart(props: { attempts: Attempt[] }): JSXElement {
  const chart = createMemo(
    (): {
      data: ChartData<"line", number[]>;
      options: ChartOptions<"line">;
    } => {
      const criteria = criteriaFor(getConfig.trainerUnlock);
      const theme = getTheme();
      const line = (
        scaleID: "wpm" | "acc",
        value: number,
        content: string,
      ): Record<string, unknown> => ({
        type: "line",
        scaleID,
        value,
        borderColor: theme.sub,
        borderWidth: 1,
        borderDash: [4, 4],
        label: {
          display: true,
          content,
          position: scaleID === "wpm" ? "start" : "end",
          backgroundColor: theme.sub,
          color: theme.bg,
          font: { size: 10 },
        },
      });
      return {
        data: {
          labels: props.attempts.map((_, index) => index + 1),
          datasets: [
            {
              label: "wpm",
              yAxisID: "wpm",
              data: props.attempts.map((attempt) => attempt.wpm),
              fill: false,
              borderColor: theme.main,
              backgroundColor: theme.main,
              pointRadius: 3,
              tension: 0.2,
            },
            {
              label: "accuracy",
              yAxisID: "acc",
              data: props.attempts.map((attempt) => attempt.acc),
              fill: false,
              borderColor: theme.text,
              backgroundColor: theme.text,
              pointStyle: "triangle",
              pointRadius: 3,
              tension: 0.2,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { axis: "x", grid: { display: false } },
            wpm: {
              axis: "y",
              type: "linear",
              position: "left",
              beginAtZero: true,
              title: { display: true, text: "wpm" },
            },
            acc: {
              axis: "y",
              type: "linear",
              position: "right",
              min: 0,
              max: 100,
              grid: { display: false },
              title: { display: true, text: "accuracy" },
            },
          },
          plugins: {
            legend: { display: false },
            annotation: {
              annotations: [
                line("wpm", criteria.minWpm, `${criteria.minWpm} wpm`),
                line("acc", criteria.minAcc, `${criteria.minAcc}%`),
              ],
            },
          },
        },
      };
    },
  );

  return (
    <div class="h-64">
      <ChartJs
        name="TrainerAttempts"
        type="line"
        data={chart().data}
        options={chart().options}
      />
    </div>
  );
}

export function TrainerPage(): JSXElement {
  const nameOf = (lesson: Lesson): string =>
    lessonName(lesson, inputLayoutObject());
  const currentName = (): string => {
    const lesson = LESSONS[currentLesson()];
    return lesson === undefined ? "" : nameOf(lesson);
  };

  const legends = (lesson: Lesson, index: number): string => {
    const layout = inputLayoutObject();
    if (layout === undefined) return "";
    const fresh = lessonChars(index, layout).fresh.join(" ");
    return fresh === nameOf(lesson) ? "" : fresh;
  };

  const bestLabel = (id: string): string => {
    const best = bestOf(id);
    return best === undefined ? "" : `best ${Math.round(best)} wpm`;
  };

  // oxlint-disable-next-line no-unassigned-vars -- assigned via SolidJS ref
  let fileInput!: HTMLInputElement;
  const pickFile = (): void => fileInput.click();
  const onFileChosen = (): void => {
    const file = fileInput.files?.[0];
    if (file === undefined) return;
    void importBackupFile(file).finally(() => {
      fileInput.value = "";
    });
  };
  createEffectOn(importRequest, pickFile, { defer: true });

  const attempts = createMemo(layoutAttempts);
  const deltas = createMemo((): KeyDelta[] =>
    keyDeltas(
      getLayoutHistory(statsName()),
      getLayoutStats(statsName()),
      dayOf(Date.now()),
    ),
  );
  const keyLegend = (delta: KeyDelta): string => {
    const layout = inputLayoutObject();
    const label =
      layout === undefined
        ? undefined
        : keycodeToLayoutKey(delta.keycode, layout);
    return label === " " ? "space" : (label ?? delta.keycode);
  };
  const shown = createMemo((): { lesson: Lesson; index: number }[] =>
    LESSONS.map((lesson, index) => ({ lesson, index })).filter(({ lesson }) =>
      lessonAvailable(lesson, progressLayout()),
    ),
  );
  const rows = createMemo((): LessonRow[] =>
    shown().map(({ lesson, index }) => {
      const own = attempts().filter((attempt) => attempt.lesson === lesson.id);
      const last = own[own.length - 1];
      return {
        index,
        number: lessonNumber(index, progressLayout()),
        name: nameOf(lesson),
        attempts: own.length,
        best: bestOf(lesson.id),
        lastWpm: last?.wpm,
        lastAcc: last?.acc,
        state: lessonState(index),
      };
    }),
  );
  const columns = lessonColumns();

  return (
    <Page id="trainer">
      <div class="grid gap-8">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <H2 text="trainer" fa={{ icon: "fa-graduation-cap" }} class="pb-0" />
          <span class="flex flex-wrap items-center gap-2">
            <Button
              fa={{ icon: "fa-download" }}
              text="export"
              variant="text"
              onClick={exportBackupFile}
            />
            <Button
              fa={{ icon: "fa-upload" }}
              text="import"
              variant="text"
              onClick={pickFile}
            />
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              class="hidden"
              data-testid="trainerImportFile"
              onChange={onFileChosen}
            />
            <Button
              fa={{ icon: "fa-play" }}
              text={`continue lesson ${lessonNumber(currentLesson(), progressLayout())}: ${currentName()}`}
              disabled={isTestActive()}
              class="px-8 py-4"
              onClick={() => void beginLesson(currentLesson())}
            />
          </span>
        </div>
        <div class="grid gap-2">
          <For each={shown()}>
            {({ lesson, index }) => {
              const state = (): LessonState => lessonState(index);
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
                    if (!locked()) void beginLesson(index);
                  }}
                >
                  <span class={cn("flex items-center gap-2", subClass())}>
                    <Fa icon={stateIcon(state(), index)} fixedWidth />
                    {lessonNumber(index, progressLayout())}
                  </span>
                  <span class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span>{nameOf(lesson)}</span>
                    <Show when={legends(lesson, index)}>
                      {(text) => (
                        <span class={cn("font-mono", subClass())}>
                          {text()}
                        </span>
                      )}
                    </Show>
                  </span>
                  <Show when={bestLabel(lesson.id)}>
                    {(text) => <span class={subClass()}>{text()}</span>}
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
        <Show when={attempts().length > 0}>
          <div class="grid gap-4">
            <div class="text-xs text-sub">attempts on this layout</div>
            <AttemptsChart attempts={attempts()} />
            <DataTable
              id="trainerLessons"
              columns={columns}
              data={rows()}
              class="text-sm"
            />
          </div>
        </Show>
        <Show when={deltas().length > 0}>
          <div class="grid gap-2" data-testid="keyChanges">
            <div class="text-xs text-sub">key changes</div>
            <ul class="list-disc pl-5 text-sm text-sub">
              <For each={deltas()}>
                {(delta) => <li>{deltaLine(delta, keyLegend(delta))}</li>}
              </For>
            </ul>
          </div>
        </Show>
      </div>
    </Page>
  );
}
