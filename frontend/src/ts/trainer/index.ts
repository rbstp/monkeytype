import { CompletedEvent } from "@monkeytype/schemas/results";
import { Config } from "../config/store";
import { getActivePage } from "../states/core";
import {
  showNoticeNotification,
  showSuccessNotification,
} from "../states/notifications";
import { __nonReactive } from "../states/test";
import { EventLog } from "../test/events/types";
import { keycodeToLayoutKey } from "../utils/key-converter";
import { resolveLayoutName } from "../utils/layout-name";
import { recordConfusions } from "./confusions";
import { drillSummary, warmUpSummary } from "./drill";
import {
  getLayoutStats,
  layoutStatsName,
  recordSamples,
  samplesFromEventLog,
} from "./key-stats";
import {
  countPerKey,
  isLessonText,
  lessonChars,
  lessonKeycodes,
  lessonName,
  lessonNumber,
  LESSONS,
  nextLesson,
  progressLayout,
  recordAttempt,
} from "./lessons";
import { getActiveDrill, getActiveLesson, rebuildLessonWords } from "./session";
import { recordTransitions } from "./transitions";

export { tracksNextKey } from "./session";

export type FinishedTest = {
  eventLog: EventLog;
  completedEvent: CompletedEvent;
  invalid: boolean;
  /** false when the test is invalid for a reason other than the accuracy gate */
  samplesUsable: boolean;
  countsForLesson: boolean;
};

export function onTestFinished(test: FinishedTest): void {
  if (!test.samplesUsable || test.eventLog.context.mode === "zen") return;

  const statsName = layoutStatsName(
    resolveLayoutName(Config.layout, Config.keymapLayout),
    Config.funbox,
  );
  const lessonIndex = getActiveLesson();
  const lesson = lessonIndex === null ? undefined : LESSONS[lessonIndex];
  const recordLesson =
    lessonIndex !== null &&
    lesson !== undefined &&
    !test.invalid &&
    test.countsForLesson &&
    !test.completedEvent.bailedOut &&
    Config.mode === "custom";
  const recordKeys = !Config.funbox.includes("layoutfluid");

  __nonReactive
    .getInputLayout()
    .then((layout) => {
      const samples = samplesFromEventLog(test.eventLog, layout);
      if (recordKeys) {
        recordSamples(statsName, samples);
        recordConfusions(statsName, samples);
        recordTransitions(statsName, samples);
        if (lessonIndex !== null && getActivePage() === "test") {
          rebuildLessonWords().catch(console.error);
        }
      }
      const drill = getActiveDrill();
      if (drill !== null && recordKeys) {
        showNoticeNotification(
          drill.kind === "warm-up"
            ? warmUpSummary(test.eventLog)
            : drillSummary(
                drill,
                getLayoutStats(statsName),
                (keycode) => keycodeToLayoutKey(keycode, layout) ?? keycode,
              ),
          { durationMs: 8000 },
        );
      }
      if (
        !recordLesson ||
        !isLessonText(
          test.eventLog.context.targetWords,
          lessonChars(lessonIndex, layout).allowed,
        )
      ) {
        return;
      }

      const layoutName = progressLayout();
      const unlocked = recordAttempt({
        lesson: lesson.id,
        layout: layoutName,
        wpm: test.completedEvent.wpm,
        acc: test.completedEvent.acc,
        perKey: countPerKey(samples, lesson, lessonKeycodes(lesson, layout)),
        ts: Date.now(),
      });
      const next = nextLesson(lessonIndex, layoutName);
      const following = next === undefined ? undefined : LESSONS[next];
      if (unlocked && next !== undefined && following !== undefined) {
        showSuccessNotification(
          `Lesson ${lessonNumber(next, layoutName)} unlocked: ${lessonName(following, layout)}`,
          { durationMs: 5000 },
        );
      }
    })
    .catch(console.error);
}
