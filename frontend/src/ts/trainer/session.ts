import { z } from "zod";
import { FunboxSchema } from "@monkeytype/schemas/configs";
import { CustomTextSettingsSchema } from "@monkeytype/schemas/results";
import { ModeSchema } from "@monkeytype/schemas/shared";
import { Config } from "../config/store";
import { saveFullConfigToLocalStorage } from "../config/persistence";
import { setConfig } from "../config/setters";
import { configEvent } from "../events/config";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { getCustomTextIndicator, setCustomTextIndicator } from "../states/core";
import { showNoticeNotification } from "../states/notifications";
import { __nonReactive, isTestActive } from "../states/test";
import * as CustomText from "../test/custom-text";
import { getLanguage } from "../utils/json-data";
import {
  buildLessonWords,
  lessonChars,
  LESSONS,
  setCurrentLesson,
} from "./lessons";

const SnapshotSchema = z.object({
  mode: ModeSchema,
  punctuation: z.boolean(),
  numbers: z.boolean(),
  funbox: FunboxSchema,
  lazyMode: z.boolean(),
  customText: CustomTextSettingsSchema,
  indicator: z.object({ name: z.string(), isLong: z.boolean() }).optional(),
});
type Snapshot = z.infer<typeof SnapshotSchema>;

const watchedKeys = ["punctuation", "numbers", "funbox", "lazyMode"] as const;
type WatchedKey = (typeof watchedKeys)[number];

const wordsPerTest = 40;

const [snapshot, setSnapshot] = useLocalStorage<Snapshot | null>({
  key: "trainerSnapshot",
  schema: SnapshotSchema.nullable(),
  fallback: null,
});

let activeLesson: number | null = null;
let applying = false;

export function getActiveLesson(): number | null {
  return activeLesson;
}

function takeSnapshot(): Snapshot {
  return {
    mode: Config.mode,
    punctuation: Config.punctuation,
    numbers: Config.numbers,
    funbox: Config.funbox,
    lazyMode: Config.lazyMode,
    customText: CustomText.getData(),
    indicator: getCustomTextIndicator(),
  };
}

function applyCustomText(settings: Snapshot["customText"]): void {
  CustomText.setPipeDelimiter(settings.pipeDelimiter);
  CustomText.setText(settings.text);
  CustomText.setMode(settings.mode);
  CustomText.setLimitMode(settings.limit.mode);
  CustomText.setLimitValue(settings.limit.value);
}

function whileApplying<T>(action: () => T): T {
  applying = true;
  try {
    return action();
  } finally {
    applying = false;
  }
}

function applyLessonConfig(): boolean {
  return whileApplying(
    () =>
      setConfig("funbox", [], { nosave: true }) &&
      setConfig("lazyMode", false, { nosave: true }) &&
      setConfig("punctuation", false, { nosave: true }) &&
      setConfig("numbers", false, { nosave: true }) &&
      setConfig("mode", "custom", { nosave: true }),
  );
}

function restore(previous: Snapshot, restoreMode: boolean): void {
  whileApplying(() => {
    if (restoreMode) setConfig("mode", previous.mode, { nosave: true });
    setConfig("lazyMode", previous.lazyMode, { nosave: true });
    setConfig("punctuation", previous.punctuation, { nosave: true });
    setConfig("numbers", previous.numbers, { nosave: true });
    setConfig("funbox", previous.funbox, { nosave: true });
  });
  saveFullConfigToLocalStorage(true);
  applyCustomText(previous.customText);
  setCustomTextIndicator(previous.indicator);
  setSnapshot(null);
}

/**
 * Prepares a custom test for the lesson. The caller restarts the test.
 */
export async function startLesson(index: number): Promise<boolean> {
  const lesson = LESSONS[index];
  if (lesson === undefined) return false;
  if (isTestActive()) {
    showNoticeNotification("Finish the current test first.");
    return false;
  }

  const [layout, language] = await Promise.all([
    __nonReactive.getInputLayout(),
    getLanguage(Config.language),
  ]);
  const words = buildLessonWords(language.words, lessonChars(index, layout));
  if (words.length === 0) {
    showNoticeNotification("This layout has no keys for this lesson.");
    return false;
  }

  const previous = snapshot() ?? takeSnapshot();
  if (!applyLessonConfig()) {
    activeLesson = null;
    restore(previous, true);
    return false;
  }
  setSnapshot(previous);
  applyCustomText({
    text: words,
    mode: "random",
    limit: { mode: "word", value: wordsPerTest },
    pipeDelimiter: false,
  });
  setCustomTextIndicator({
    name: `lesson ${index + 1}: ${lesson.name}`,
    isLong: false,
  });

  activeLesson = index;
  setCurrentLesson(index);
  return true;
}

export function stopLesson(options = { restoreMode: true }): void {
  activeLesson = null;
  const previous = snapshot();
  if (previous !== null) restore(previous, options.restoreMode);
}

configEvent.subscribe(({ key }) => {
  if (applying) return;
  if (key === "fullConfigChangeFinished" && activeLesson === null) {
    const leftover = snapshot();
    if (leftover !== null) restore(leftover, true);
    return;
  }
  if (activeLesson === null) return;
  if (key === "mode") {
    stopLesson({ restoreMode: false });
  } else if (watchedKeys.includes(key as WatchedKey)) {
    const watched = key as WatchedKey;
    setSnapshot((current) =>
      current === null ? null : { ...current, [watched]: Config[watched] },
    );
  }
});
