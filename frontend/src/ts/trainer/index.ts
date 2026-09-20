import { CompletedEvent } from "@monkeytype/schemas/results";
import { Config } from "../config/store";
import { showSuccessNotification } from "../states/notifications";
import { __nonReactive } from "../states/test";
import { EventLog } from "../test/events/types";
import {
  layoutStatsName,
  recordSamples,
  samplesFromEventLog,
} from "./key-stats";
import {
  countPerKey,
  isLessonText,
  lessonChars,
  LESSONS,
  recordAttempt,
} from "./lessons";
import { getActiveLesson } from "./session";

export { tracksNextKey } from "./session";

export type FinishedTest = {
  eventLog: EventLog;
  completedEvent: CompletedEvent;
  invalid: boolean;
  countsForLesson: boolean;
};

export function onTestFinished(test: FinishedTest): void {
  if (test.invalid || test.eventLog.context.mode === "zen") return;

  const layoutName = layoutStatsName(Config.layout, Config.funbox);
  const lessonIndex = getActiveLesson();
  const lesson = lessonIndex === null ? undefined : LESSONS[lessonIndex];
  const recordLesson =
    lessonIndex !== null &&
    lesson !== undefined &&
    test.countsForLesson &&
    !test.completedEvent.bailedOut &&
    Config.mode === "custom";
  const recordKeys = !Config.funbox.includes("layoutfluid");

  __nonReactive
    .getInputLayout()
    .then((layout) => {
      const samples = samplesFromEventLog(test.eventLog, layout);
      if (recordKeys) recordSamples(layoutName, samples);
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
        lesson: lessonIndex,
        wpm: test.completedEvent.wpm,
        acc: test.completedEvent.acc,
        perKey: countPerKey(samples, lesson),
        ts: Date.now(),
      });
      if (unlocked) {
        showSuccessNotification(
          `Lesson ${lessonIndex + 2} unlocked: ${LESSONS[lessonIndex + 1]?.name}`,
          { durationMs: 5000 },
        );
      }
    })
    .catch(console.error);
}
