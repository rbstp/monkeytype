import { LayoutObject } from "@monkeytype/schemas/layouts";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { readFileSync } from "fs";
import { createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonNotice } from "../../../../../src/ts/components/pages/test/modes-notice/LessonNotice";
import { setConfigStore } from "../../../../../src/ts/config/store";
import { isModalOpen } from "../../../../../src/ts/states/modals";
import * as TestState from "../../../../../src/ts/states/test";
import {
  LESSONS,
  Progress,
  recordAttempt,
  replaceProgress,
  resetProgress,
} from "../../../../../src/ts/trainer/lessons";
import * as Session from "../../../../../src/ts/trainer/session";

vi.mock("../../../../../src/ts/trainer/session", () => ({
  getActiveLesson: vi.fn(),
}));
vi.mock("../../../../../src/ts/utils/json-data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLayout: async (name: string) => readLayout(name),
}));

function readLayout(name: string): LayoutObject {
  return JSON.parse(
    readFileSync(
      `${import.meta.dirname}/../../../../../static/layouts/${name}.json`,
      "utf-8",
    ),
  ) as LayoutObject;
}

const qwerty = readLayout("qwerty");
const dvorak = readLayout("dvorak");
const canadianFrench = readLayout("canadian_french");

function stored(layouts: Progress["layouts"]): Progress {
  return { version: 3, layouts, attempts: [] };
}

describe("LessonNotice", () => {
  const [activeLesson, setActiveLesson] = createSignal<number | null>(null);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Session.getActiveLesson).mockImplementation(() => activeLesson());
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(qwerty);
    setActiveLesson(null);
    resetProgress();
    setConfigStore("trainerUnlock", "normal");
    setConfigStore("layout", "default");
    setConfigStore("keymapLayout", "overrideSync");
  });

  it("renders nothing without an active lesson", () => {
    const { container } = render(() => <LessonNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the weak key holding the lesson without attempts", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 3: r u · accuracy phase: r needs 20 more samples",
    );
  });

  it("names the wpm shortfall once every new key is mastered", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    recordAttempt({
      lesson: "r-u",
      layout: "qwerty",
      wpm: 20,
      acc: 98,
      perKey: {
        KeyR: { total: 20, errors: 0 },
        KeyU: { total: 20, errors: 0 },
      },
      ts: 1,
    });
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 3: r u · best 20 · speed phase: 20 wpm, 10 short of 30",
    );
    setConfigStore("trainerUnlock", "strict");
    expect(screen.getByRole("button")).toHaveTextContent("15 short of 35");
  });

  it("says passed once nothing is short", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    recordAttempt({
      lesson: "r-u",
      layout: "qwerty",
      wpm: 40,
      acc: 99,
      perKey: {
        KeyR: { total: 20, errors: 0 },
        KeyU: { total: 20, errors: 0 },
      },
      ts: 1,
    });
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 3: r u · best 40 · passed",
    );
  });

  it("names the lesson by the legends of the input layout", () => {
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(dvorak);
    setActiveLesson(2);
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).toHaveTextContent("lesson 3: p g");
    setActiveLesson(12);
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 13: capitals left",
    );
  });

  it("reads best from the active lesson only", () => {
    setActiveLesson(2);
    replaceProgress(
      stored({
        qwerty: {
          current: "r-u",
          unlocked: "r-u",
          best: { "e-i": 55, "r-u": 31.6 },
        },
      }),
    );
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 3: r u · best 32 · accuracy phase: r needs 20 more samples",
    );
  });

  it("reads best from the active layout only", () => {
    setActiveLesson(2);
    replaceProgress(
      stored({
        qwerty: { current: "r-u", unlocked: "r-u", best: { "r-u": 31.6 } },
        dvorak: { current: "r-u", unlocked: "r-u", best: { "r-u": 45 } },
      }),
    );
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).toHaveTextContent("best 32");
    setConfigStore("layout", "dvorak");
    expect(screen.getByRole("button")).toHaveTextContent("best 45");
    setConfigStore("layout", "colemak");
    expect(screen.getByRole("button")).not.toHaveTextContent("best");
  });

  it("reads the floor from the unlock setting", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    recordAttempt({
      lesson: "r-u",
      layout: "qwerty",
      wpm: 40,
      acc: 95,
      perKey: {},
      ts: 1,
    });
    expect(screen.getByRole("button")).toHaveTextContent(
      "accuracy phase: accuracy 95%, 2 short of 97%",
    );
    setConfigStore("trainerUnlock", "strict");
    expect(screen.getByRole("button")).toHaveTextContent("3 short of 98%");
  });

  it("updates when a new best is stored", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).not.toHaveTextContent("best");
    recordAttempt({
      lesson: "r-u",
      layout: "qwerty",
      wpm: 29,
      acc: 98,
      perKey: {},
      ts: 1,
    });
    expect(screen.getByRole("button")).toHaveTextContent("best 29");
  });

  it("appears and disappears with the active lesson", () => {
    const { container } = render(() => <LessonNotice />);
    expect(container).toBeEmptyDOMElement();
    setActiveLesson(0);
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 1: a s d f j k l ;",
    );
    setActiveLesson(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the accuracy target on an accents lesson with no attempts", () => {
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(canadianFrench);
    setConfigStore("keymapLayout", "canadian_french");
    setActiveLesson(
      LESSONS.findIndex((lesson) => lesson.id === "accents-direct"),
    );
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 18: é ç · accuracy phase: target 97%",
    );
  });

  it("shows the lesson picker on click", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    expect(isModalOpen("lessonPicker")).toBe(false);
    fireEvent.click(screen.getByRole("button"));
    expect(isModalOpen("lessonPicker")).toBe(true);
  });

  it("renders nothing for a stored index beyond the lesson list", () => {
    setActiveLesson(LESSONS.length);
    const { container } = render(() => <LessonNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
