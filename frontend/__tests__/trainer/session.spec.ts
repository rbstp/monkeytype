import { readFileSync } from "fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletedEvent } from "@monkeytype/schemas/results";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import * as ApeConfig from "../../src/ts/ape/config";
import * as Core from "../../src/ts/states/core";
import * as Lifecycle from "../../src/ts/config/lifecycle";
import { saveFullConfigToLocalStorage } from "../../src/ts/config/persistence";
import { setConfig } from "../../src/ts/config/setters";
import { Config, getConfig } from "../../src/ts/config/store";
import { __testing } from "../../src/ts/config/testing";
import { getDefaultConfig } from "../../src/ts/constants/default-config";
import { restartTestEvent } from "../../src/ts/events/test";
import * as Notifications from "../../src/ts/states/notifications";
import * as TestState from "../../src/ts/states/test";
import * as CustomText from "../../src/ts/test/custom-text";
import { EventLog } from "../../src/ts/test/events/types";
import * as PractiseWords from "../../src/ts/test/practise-words";
import { onTestFinished } from "../../src/ts/trainer";
import { getKeyStats, resetKeyStats } from "../../src/ts/trainer/key-stats";
import {
  Attempt,
  currentLesson,
  isLessonText,
  lessonChars,
  LESSONS,
  progress,
  Progress,
  recordAttempt,
  replaceProgress,
  resetProgress,
  unlockedUpTo,
} from "../../src/ts/trainer/lessons";
import {
  getActiveLesson,
  largestCorpus,
  startLesson,
  stopLesson,
} from "../../src/ts/trainer/session";
import * as JsonData from "../../src/ts/utils/json-data";

vi.mock("../../src/ts/test/events/stats", () => ({
  getMissedWords: () => ({ as: 2 }),
  getInputHistory: () => [],
  getWordBurstHistory: () => [],
}));

const qwerty = JSON.parse(
  readFileSync(
    `${import.meta.dirname}/../../static/layouts/qwerty.json`,
    "utf-8",
  ),
) as LayoutObject;

const { replaceConfig } = __testing;

function finished(targetWords: string[]): void {
  const eventLog: EventLog = {
    version: 1,
    events: [
      {
        type: "input",
        testMs: 100,
        data: {
          inputType: "insertText",
          data: targetWords[0]?.[0] ?? "",
          correct: true,
          wordIndex: 0,
          charIndex: 0,
          inputValue: "",
        },
      },
    ],
    context: {
      targetWords,
      mode: "custom",
      mode2: "custom",
      bailedOut: false,
      koreanStatus: false,
    },
  };
  onTestFinished({
    eventLog,
    completedEvent: { wpm: 40, acc: 100, bailedOut: false } as CompletedEvent,
    invalid: false,
    countsForLesson: true,
  });
}

const flush = async (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

function attemptFor(lesson: string, samples: number): Attempt {
  const keys = LESSONS.find((item) => item.id === lesson)?.newKeys ?? [];
  return {
    lesson,
    layout: "qwerty",
    wpm: 40,
    acc: 100,
    perKey: Object.fromEntries(
      keys.map((keycode) => [keycode, { total: samples, errors: 0 }]),
    ),
    ts: 0,
  };
}

describe("trainer session", () => {
  const getInputLayoutMock = vi
    .spyOn(TestState.__nonReactive, "getInputLayout")
    .mockResolvedValue(qwerty);
  const getLanguageMock = vi.spyOn(JsonData, "getLanguage").mockResolvedValue({
    name: "english",
    words: ["as", "all", "sad", "fall", "lass", "flask"],
  } as never);
  const noticeMock = vi
    .spyOn(Notifications, "showNoticeNotification")
    .mockReturnValue(0);
  const successMock = vi
    .spyOn(Notifications, "showSuccessNotification")
    .mockReturnValue(0);
  const saveConfigMock = vi.spyOn(ApeConfig, "saveConfig").mockResolvedValue();

  beforeEach(() => {
    stopLesson();
    resetProgress();
    resetKeyStats();
    noticeMock.mockClear();
    successMock.mockClear();
    saveConfigMock.mockClear();
    replaceConfig({ mode: "time", punctuation: true, numbers: false });
    CustomText.setText(["before"]);
    TestState.setLastEventLog(null);
  });

  afterAll(() => {
    getInputLayoutMock.mockRestore();
    getLanguageMock.mockRestore();
    noticeMock.mockRestore();
    successMock.mockRestore();
    saveConfigMock.mockRestore();
  });

  describe("corpus", () => {
    it("names the biggest word list that exists", () => {
      const exists = (name: string): boolean =>
        [
          "english",
          "english_1k",
          "english_10k",
          "french",
          "french_1k",
        ].includes(name);
      expect(largestCorpus("english", exists)).toBe("english_10k");
      expect(largestCorpus("english_1k", exists)).toBe("english_10k");
      expect(largestCorpus("french", exists)).toBe("french_1k");
      expect(largestCorpus("code_python", exists)).toBe("code_python");
      expect(largestCorpus("english")).toBe("english_10k");
      expect(largestCorpus("bashkir")).toBe("bashkir");
    });

    it("loads the biggest corpus for the configured language", async () => {
      getLanguageMock.mockClear();
      replaceConfig({ mode: "time", language: "english" });
      expect(await startLesson(0)).toBe(true);
      expect(getLanguageMock).toHaveBeenCalledWith("english_10k");
      expect(getLanguageMock).not.toHaveBeenCalledWith("english");
    });

    it("draws by rank when the corpus is ordered by frequency", async () => {
      getLanguageMock.mockResolvedValueOnce({
        name: "english_10k",
        orderedByFrequency: true,
        words: ["as", "all", "sad", "fall", "lass", "flask"],
      } as never);
      expect(await startLesson(0)).toBe(true);
      const text = CustomText.getText();
      expect(text).toHaveLength(120);
      expect(text.filter((word) => word === "as").length).toBeGreaterThan(
        text.filter((word) => word === "flask").length,
      );
    });
  });

  it("applies the lesson config and restores it on stop", async () => {
    expect(await startLesson(0)).toBe(true);
    expect(getActiveLesson()).toBe(0);
    expect(Config.mode).toBe("custom");
    expect(Config.punctuation).toBe(false);

    stopLesson();
    expect(getActiveLesson()).toBeNull();
    expect(Config.mode).toBe("time");
    expect(Config.punctuation).toBe(true);
    expect(CustomText.getText()).toEqual(["before"]);
  });

  it("keeps Config and the store in agreement when a reload resumes", async () => {
    await startLesson(0);
    const lessonWords = CustomText.getText();

    await Lifecycle.applyConfig({ ...getDefaultConfig(), mode: "words" });

    expect(getActiveLesson()).toBe(0);
    expect(Config.mode).toBe("custom");
    expect(getConfig.mode).toBe("custom");
    expect(Config.punctuation).toBe(false);
    expect(getConfig.punctuation).toBe(false);
    expect(CustomText.getText()).toEqual(lessonWords);

    stopLesson();
    expect(Config.mode).toBe("words");
    expect(getConfig.mode).toBe("words");
  });

  it("restores the preset values after a preset lands mid-lesson", async () => {
    await startLesson(1);

    await Lifecycle.applyConfig({
      ...getDefaultConfig(),
      mode: "words",
      numbers: true,
      lazyMode: true,
    });
    expect(Config.mode).toBe("custom");
    expect(Config.numbers).toBe(false);

    stopLesson();
    expect(Config.mode).toBe("words");
    expect(Config.numbers).toBe(true);
    expect(Config.lazyMode).toBe(true);
    expect(CustomText.getText()).toEqual(["before"]);
  });

  it("stops the lesson when a watched key changes and keeps the change", async () => {
    replaceConfig({ mode: "time", punctuation: false });
    await startLesson(0);

    expect(setConfig("punctuation", true)).toBe(true);

    expect(getActiveLesson()).toBeNull();
    expect(Config.punctuation).toBe(true);
    expect(Config.mode).toBe("time");
    expect(CustomText.getText()).toEqual(["before"]);
    expect(noticeMock).toHaveBeenCalledWith(
      "Lesson stopped: punctuation changed",
    );

    await startLesson(0);
    expect(setConfig("numbers", true)).toBe(true);
    expect(getActiveLesson()).toBeNull();
    expect(Config.numbers).toBe(true);
    expect(noticeMock).toHaveBeenCalledWith("Lesson stopped: numbers changed");
  });

  it("stops the lesson when a funbox is toggled on", async () => {
    await startLesson(0);

    expect(setConfig("funbox", ["rAnDoMcAsE"])).toBe(true);

    expect(getActiveLesson()).toBeNull();
    expect(Config.funbox).toEqual(["rAnDoMcAsE"]);
    expect(Config.mode).toBe("time");
    expect(noticeMock).toHaveBeenCalledWith("Lesson stopped: funbox changed");
  });

  it("ignores a watched key set to its current value", async () => {
    await startLesson(0);

    expect(setConfig("punctuation", false)).toBe(true);
    expect(setConfig("funbox", [])).toBe(true);
    expect(setConfig("layout", Config.layout)).toBe(true);

    expect(getActiveLesson()).toBe(0);
    expect(noticeMock).not.toHaveBeenCalled();
  });

  it("stops the lesson when the layout or language changes", async () => {
    await startLesson(0);
    expect(setConfig("layout", "dvorak")).toBe(true);
    expect(getActiveLesson()).toBeNull();
    expect(Config.layout).toBe("dvorak");
    expect(Config.mode).toBe("time");
    expect(noticeMock).toHaveBeenCalledWith("Lesson stopped: layout changed");

    await startLesson(0);
    expect(setConfig("language", "french")).toBe(true);
    expect(getActiveLesson()).toBeNull();
    expect(Config.language).toBe("french");
    expect(Config.mode).toBe("time");
    expect(noticeMock).toHaveBeenCalledWith("Lesson stopped: language changed");
  });

  it("stops the lesson when a full config change brings a new layout", async () => {
    await startLesson(0);

    await Lifecycle.applyConfig({
      ...getDefaultConfig(),
      mode: "words",
      layout: "dvorak",
    });

    expect(getActiveLesson()).toBeNull();
    expect(Config.layout).toBe("dvorak");
    expect(Config.mode).toBe("words");
    expect(getConfig.mode).toBe("words");
    expect(CustomText.getText()).toEqual(["before"]);
    expect(noticeMock).toHaveBeenCalledWith("Lesson stopped: layout changed");
  });

  it("persists the pre-lesson values while a lesson is active", async () => {
    await startLesson(0);

    saveFullConfigToLocalStorage();

    const stored = JSON.parse(localStorage.getItem("config") ?? "{}") as {
      mode: string;
      punctuation: boolean;
    };
    expect(stored.mode).toBe("time");
    expect(stored.punctuation).toBe(true);
    expect(saveConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "time", punctuation: true }),
    );
    expect(Config.mode).toBe("custom");

    stopLesson();
    replaceConfig({ mode: "words", punctuation: false });
    saveFullConfigToLocalStorage();
    expect(saveConfigMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "words", punctuation: false }),
    );
  });

  it("persists the pre-lesson values when a single key is saved", async () => {
    await startLesson(0);

    expect(setConfig("smoothCaret", "off")).toBe(true);

    const stored = JSON.parse(localStorage.getItem("config") ?? "{}") as {
      mode: string;
      punctuation: boolean;
      smoothCaret: string;
    };
    expect(getActiveLesson()).toBe(0);
    expect(stored.mode).toBe("time");
    expect(stored.punctuation).toBe(true);
    expect(stored.smoothCaret).toBe("off");
  });

  describe("settings", () => {
    const attempt = (wpm: number, acc: number): Attempt => ({
      lesson: "home-row",
      layout: "qwerty",
      wpm,
      acc,
      perKey: Object.fromEntries(
        (LESSONS[0]?.newKeys ?? []).map((keycode) => [
          keycode,
          { total: 20, errors: 0 },
        ]),
      ),
      ts: 0,
    });
    const stored = (attempts: Attempt[]): Progress => ({
      version: 2 as const,
      layouts: {},
      attempts,
    });

    it("sizes the lesson from trainerWordsPerTest", async () => {
      replaceConfig({ mode: "time", trainerWordsPerTest: 12 });
      expect(await startLesson(0)).toBe(true);
      expect(CustomText.getLimitValue()).toBe(12);
      expect(CustomText.getText().length).toBeGreaterThan(12);
    });

    it("resizes and restarts when words per test changes mid-lesson", async () => {
      const pageMock = vi.spyOn(Core, "getActivePage").mockReturnValue("test");
      CustomText.setLimitValue(7);
      await startLesson(0);
      const restarts = vi.fn();
      const unsubscribe = restartTestEvent.subscribe(restarts);
      expect(setConfig("trainerWordsPerTest", 20)).toBe(true);
      unsubscribe();
      pageMock.mockRestore();
      expect(getActiveLesson()).toBe(0);
      expect(CustomText.getLimitValue()).toBe(20);
      expect(restarts).toHaveBeenCalledTimes(1);

      stopLesson();
      expect(CustomText.getLimitValue()).toBe(7);
    });

    it("resizes without a restart away from the test page", async () => {
      const pageMock = vi
        .spyOn(Core, "getActivePage")
        .mockReturnValue("settings");
      await startLesson(0);
      const restarts = vi.fn();
      const unsubscribe = restartTestEvent.subscribe(restarts);
      expect(setConfig("trainerWordsPerTest", 20)).toBe(true);
      unsubscribe();
      pageMock.mockRestore();
      expect(CustomText.getLimitValue()).toBe(20);
      expect(restarts).not.toHaveBeenCalled();
    });

    it("re-applies the limit when a full config change resumes the lesson", async () => {
      await startLesson(0);
      await Lifecycle.applyConfig({
        ...getDefaultConfig(),
        mode: "custom",
        trainerWordsPerTest: 25,
      });
      expect(getActiveLesson()).toBe(0);
      expect(CustomText.getLimitValue()).toBe(25);
    });

    it("ignores words per test without a lesson", () => {
      CustomText.setLimitValue(7);
      const restarts = vi.fn();
      const unsubscribe = restartTestEvent.subscribe(restarts);
      expect(setConfig("trainerWordsPerTest", 20)).toBe(true);
      unsubscribe();
      expect(CustomText.getLimitValue()).toBe(7);
      expect(restarts).not.toHaveBeenCalled();
    });

    it("judges an attempt against the configured bar", () => {
      replaceConfig({ trainerUnlock: "strict" });
      expect(recordAttempt(attempt(36, 99))).toBe(false);
      expect(unlockedUpTo()).toBe(0);
      expect(recordAttempt(attempt(36, 99))).toBe(true);
      expect(unlockedUpTo()).toBe(1);
    });

    it("re-evaluates stored attempts when the bar changes", () => {
      replaceProgress(stored([attempt(26, 96)]));
      expect(unlockedUpTo()).toBe(0);
      expect(setConfig("trainerUnlock", "relaxed")).toBe(true);
      expect(unlockedUpTo()).toBe(1);
      expect(setConfig("trainerUnlock", "strict")).toBe(true);
      expect(unlockedUpTo()).toBe(1);
    });

    it("re-evaluates stored attempts once the config loads", async () => {
      replaceProgress(stored([attempt(26, 96)]));
      await Lifecycle.applyConfig({
        ...getDefaultConfig(),
        trainerUnlock: "relaxed",
      });
      expect(unlockedUpTo()).toBe(1);
    });
  });

  it("leaves a test alone when no lesson is active", async () => {
    finished(["hello ", "world "]);
    await flush();

    expect(progress().attempts).toHaveLength(0);
    expect(getKeyStats().layouts["qwerty"]?.["KeyH"]?.total).toBe(1);
    expect(Config.mode).toBe("time");
  });

  describe("scoring gate", () => {
    it("rejects target words outside the lesson alphabet", () => {
      const { allowed } = lessonChars(0, qwerty);
      expect(isLessonText(["as ", "dad "], allowed)).toBe(true);
      expect(isLessonText(["as ", "sat "], allowed)).toBe(false);
      expect(isLessonText(["As "], allowed)).toBe(false);
      expect(isLessonText([], allowed)).toBe(false);
    });

    it("records an attempt only for lesson text", async () => {
      await startLesson(0);

      finished(["as ", "sad ", "hello "]);
      await flush();
      expect(progress().attempts).toHaveLength(0);

      finished(["as ", "sad ", "fall "]);
      await flush();
      expect(progress().attempts).toHaveLength(1);
      expect(progress().attempts[0]).toMatchObject({
        lesson: "home-row",
        layout: "qwerty",
        wpm: 40,
      });
      expect(currentLesson()).toBe(0);
      expect(progress().layouts["qwerty"]?.best).toEqual({ "home-row": 40 });
    });

    it("passes the floors on one key without a toast or an unlock", async () => {
      await startLesson(0);

      finished(["as ", "sad ", "fall "]);
      await flush();

      expect(progress().attempts[0]?.perKey).toEqual({
        KeyA: { total: 1, errors: 0 },
      });
      expect(unlockedUpTo()).toBe(0);
      expect(successMock).not.toHaveBeenCalled();
    });

    it("toasts the unlock once every new key is mastered", async () => {
      await startLesson(0);
      replaceProgress({
        version: 2,
        layouts: {},
        attempts: [
          {
            ...attemptFor("home-row", 8),
            perKey: {
              ...attemptFor("home-row", 8).perKey,
              KeyA: { total: 7, errors: 0 },
            },
          },
        ],
      });
      expect(unlockedUpTo()).toBe(0);

      finished(["as ", "sad ", "fall "]);
      await flush();

      expect(unlockedUpTo()).toBe(1);
      expect(successMock).toHaveBeenCalledWith(
        "Lesson 2 unlocked: e i",
        expect.anything(),
      );
    });

    it("records key samples under the keymap layout for a default layout", async () => {
      replaceConfig({ mode: "words", keymapLayout: "canadian_french" });

      finished(["as "]);
      await flush();

      expect(getKeyStats().layouts["qwerty"]).toBeUndefined();
      expect(getKeyStats().layouts["canadian_french"]?.["KeyA"]?.total).toBe(1);
    });

    it("skips key samples while layoutfluid is active", async () => {
      replaceConfig({ mode: "words", funbox: ["layoutfluid"] });

      finished(["as "]);
      await flush();

      expect(getKeyStats().layouts["qwerty"]).toBeUndefined();
    });
  });

  it("ends the lesson before practise words captures its snapshot", async () => {
    await startLesson(0);
    TestState.setLastEventLog({
      version: 1,
      events: [],
      context: {
        targetWords: ["as "],
        mode: "custom",
        mode2: "custom",
        bailedOut: false,
        koreanStatus: false,
      },
    });

    expect(PractiseWords.init("words", false)).toBe(true);

    expect(getActiveLesson()).toBeNull();
    expect(PractiseWords.before.mode).toBe("time");
    expect(PractiseWords.before.punctuation).toBe(true);
    expect(PractiseWords.before.customText).toBeNull();
    expect(Config.mode).toBe("custom");
    expect(CustomText.getText()).toEqual(["as", "as"]);
  });

  it("hands practise words the pre-lesson custom text", async () => {
    replaceConfig({ mode: "custom" });
    await startLesson(0);
    TestState.setLastEventLog({
      version: 1,
      events: [],
      context: {
        targetWords: ["as "],
        mode: "custom",
        mode2: "custom",
        bailedOut: false,
        koreanStatus: false,
      },
    });

    expect(PractiseWords.init("words", false)).toBe(true);

    expect(PractiseWords.before.mode).toBe("custom");
    expect(PractiseWords.before.customText?.text).toEqual(["before"]);
  });
});
