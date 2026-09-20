import { readFileSync } from "fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletedEvent } from "@monkeytype/schemas/results";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import * as ApeConfig from "../../src/ts/ape/config";
import * as Lifecycle from "../../src/ts/config/lifecycle";
import { saveFullConfigToLocalStorage } from "../../src/ts/config/persistence";
import { setConfig } from "../../src/ts/config/setters";
import { Config, getConfig } from "../../src/ts/config/store";
import { __testing } from "../../src/ts/config/testing";
import { getDefaultConfig } from "../../src/ts/constants/default-config";
import * as Notifications from "../../src/ts/states/notifications";
import * as TestState from "../../src/ts/states/test";
import * as CustomText from "../../src/ts/test/custom-text";
import { EventLog } from "../../src/ts/test/events/types";
import * as PractiseWords from "../../src/ts/test/practise-words";
import { onTestFinished } from "../../src/ts/trainer";
import { getKeyStats, resetKeyStats } from "../../src/ts/trainer/key-stats";
import {
  isLessonText,
  lessonChars,
  progress,
  resetProgress,
} from "../../src/ts/trainer/lessons";
import {
  getActiveLesson,
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
  const saveConfigMock = vi.spyOn(ApeConfig, "saveConfig").mockResolvedValue();

  beforeEach(() => {
    stopLesson();
    resetProgress();
    resetKeyStats();
    noticeMock.mockClear();
    saveConfigMock.mockClear();
    replaceConfig({ mode: "time", punctuation: true, numbers: false });
    CustomText.setText(["before"]);
    TestState.setLastEventLog(null);
  });

  afterAll(() => {
    getInputLayoutMock.mockRestore();
    getLanguageMock.mockRestore();
    noticeMock.mockRestore();
    saveConfigMock.mockRestore();
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
