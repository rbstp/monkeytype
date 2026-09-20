import { untrack } from "solid-js";
import { z } from "zod";
import { FunboxSchema } from "@monkeytype/schemas/configs";
import { CustomTextSettingsSchema } from "@monkeytype/schemas/results";
import { ModeSchema } from "@monkeytype/schemas/shared";
import { Config } from "../config/store";
import {
  saveFullConfigToLocalStorage,
  setPersistedConfigHook,
} from "../config/persistence";
import { setConfig } from "../config/setters";
import { configEvent } from "../events/config";
import { restartTestEvent } from "../events/test";
import { useLocalStorage } from "../hooks/useLocalStorage";
import {
  getActivePage,
  getCustomTextIndicator,
  setCustomTextIndicator,
} from "../states/core";
import { showNoticeNotification } from "../states/notifications";
import { __nonReactive, isTestActive } from "../states/test";
import * as CustomText from "../test/custom-text";
import { areUnsortedArraysEqual } from "../utils/arrays";
import { getLanguage } from "../utils/json-data";
import { camelCaseToWords } from "../utils/strings";
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
  layout: z.string().optional(),
  language: z.string().optional(),
  customText: CustomTextSettingsSchema,
  indicator: z.object({ name: z.string(), isLong: z.boolean() }).optional(),
});
type Snapshot = z.infer<typeof SnapshotSchema>;

const snapshotKeys = ["punctuation", "numbers", "funbox", "lazyMode"] as const;
const textKeys = ["layout", "language"] as const;
const watchedKeys: readonly string[] = [...snapshotKeys, ...textKeys];

const [snapshot, setSnapshot] = useLocalStorage<Snapshot | null>({
  key: "trainerSnapshot",
  schema: SnapshotSchema.nullable(),
  fallback: null,
});

const [activeLesson, setActiveLesson] = useLocalStorage<number | null>({
  key: "trainerActiveLesson",
  schema: z.number().int().nonnegative().nullable(),
  fallback: null,
});

let applying = false;
let inFullConfigChange = false;

export function getActiveLesson(): number | null {
  return activeLesson();
}

/**
 * Lessons always track the next key, so the keymap can name the finger to use
 * even when the keymap mode is not "next".
 */
export function tracksNextKey(): boolean {
  return Config.keymapMode === "next" || activeLesson() !== null;
}

function configSnapshot(): Omit<Snapshot, "customText" | "indicator"> {
  return {
    mode: Config.mode,
    punctuation: Config.punctuation,
    numbers: Config.numbers,
    funbox: Config.funbox,
    lazyMode: Config.lazyMode,
    layout: Config.layout,
    language: Config.language,
  };
}

function takeSnapshot(): Snapshot {
  return {
    ...configSnapshot(),
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
    setActiveLesson(null);
    restore(previous, true);
    return false;
  }
  setSnapshot(previous);
  applyCustomText({
    text: words,
    mode: "random",
    limit: { mode: "word", value: Config.trainerWordsPerTest },
    pipeDelimiter: false,
  });
  setCustomTextIndicator({
    name: `lesson ${index + 1}: ${lesson.name}`,
    isLong: false,
  });

  setActiveLesson(index);
  setCurrentLesson(index);
  return true;
}

/**
 * Re-applies the lesson config after a reload. The config is applied with
 * nosave, so a fresh page comes back with the pre-lesson mode even though the
 * lesson words and the stored lesson are still there.
 */
function resumeLesson(index: number): void {
  const lesson = LESSONS[index];
  if (lesson === undefined || !applyLessonConfig()) {
    stopLesson();
    return;
  }
  CustomText.setLimitValue(Config.trainerWordsPerTest);
  setCustomTextIndicator({
    name: `lesson ${index + 1}: ${lesson.name}`,
    isLong: false,
  });
}

export function stopLesson(options = { restoreMode: true }): void {
  setActiveLesson(null);
  const previous = snapshot();
  if (previous !== null) restore(previous, options.restoreMode);
}

function stopForChange(key: string): void {
  stopLesson();
  showNoticeNotification(`Lesson stopped: ${camelCaseToWords(key)} changed`);
}

function isUnchanged(a: unknown, b: unknown): boolean {
  return Array.isArray(a) && Array.isArray(b)
    ? areUnsortedArraysEqual(a, b)
    : a === b;
}

configEvent.subscribe(({ key, newValue, previousValue }) => {
  if (applying) return;
  if (key === "fullConfigChange") {
    inFullConfigChange = true;
    return;
  }
  if (key === "fullConfigChangeFinished") {
    inFullConfigChange = false;
    const lesson = activeLesson();
    const previous = snapshot();
    if (lesson === null) {
      if (previous !== null) restore(previous, true);
      return;
    }
    if (previous === null) {
      setActiveLesson(null);
      return;
    }
    // the incoming config is what stopLesson must return to
    setSnapshot({ ...previous, ...configSnapshot() });
    const stale = textKeys.find(
      (textKey) =>
        previous[textKey] !== undefined &&
        previous[textKey] !== Config[textKey],
    );
    if (stale !== undefined) {
      stopForChange(stale);
      return;
    }
    resumeLesson(lesson);
    return;
  }
  // a full config change replays every key, which would look like the user
  // leaving the lesson
  if (inFullConfigChange) return;
  if (activeLesson() === null) return;
  if (key === "mode") {
    stopLesson({ restoreMode: false });
  } else if (key === "trainerWordsPerTest") {
    CustomText.setLimitValue(newValue);
    if (getActivePage() === "test") restartTestEvent.dispatch();
  } else if (
    watchedKeys.includes(key) &&
    !isUnchanged(newValue, previousValue)
  ) {
    setSnapshot((current) =>
      current === null ? null : { ...current, [key]: Config[key] },
    );
    stopForChange(key);
  }
});

setPersistedConfigHook((config) =>
  untrack(() => {
    const previous = snapshot();
    if (activeLesson() === null || previous === null) return config;
    return {
      ...config,
      mode: previous.mode,
      punctuation: previous.punctuation,
      numbers: previous.numbers,
      funbox: previous.funbox,
      lazyMode: previous.lazyMode,
    };
  }),
);
