import { CompletedEvent } from "@monkeytype/schemas/results";
import { Config } from "../config/store";
import {
  showNoticeNotification,
  showSuccessNotification,
} from "../states/notifications";
import { __nonReactive } from "../states/test";
import { EventLog } from "../test/events/types";
import { keycodeToLayoutKey } from "../utils/key-converter";
import { resolveLayoutName } from "../utils/layout-name";
import { drillSummary } from "./drill";
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
  lessonName,
  LESSONS,
  progressLayout,
  recordAttempt,
} from "./lessons";
import { getActiveDrill, getActiveLesson } from "./session";

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

  const layoutName = layoutStatsName(
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
      if (recordKeys) recordSamples(layoutName, samples);
      const drill = getActiveDrill();
      if (drill !== null && recordKeys) {
        showNoticeNotification(
          drillSummary(
            drill,
            getLayoutStats(layoutName),
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

      const unlocked = recordAttempt({
        lesson: lesson.id,
        layout: progressLayout(),
        wpm: test.completedEvent.wpm,
        acc: test.completedEvent.acc,
        perKey: countPerKey(samples, lesson),
        ts: Date.now(),
      });
      const following = LESSONS[lessonIndex + 1];
      if (unlocked && following !== undefined) {
        showSuccessNotification(
          `Lesson ${lessonIndex + 2} unlocked: ${lessonName(following, layout)}`,
          { durationMs: 5000 },
        );
      }
    })
    .catch(console.error);
}
