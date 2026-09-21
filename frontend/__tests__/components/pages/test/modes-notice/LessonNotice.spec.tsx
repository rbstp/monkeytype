import { LayoutObject } from "@monkeytype/schemas/layouts";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { readFileSync } from "fs";
import { createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonNotice } from "../../../../../src/ts/components/pages/test/modes-notice/LessonNotice";
import { setConfigStore } from "../../../../../src/ts/config/store";
import * as RouteController from "../../../../../src/ts/controllers/route-controller";
import * as TestState from "../../../../../src/ts/states/test";
import {
  LESSONS,
  Progress,
  recordAttempt,
  replaceProgress,
  resetProgress,
} from "../../../../../src/ts/trainer/lessons";
import * as Session from "../../../../../src/ts/trainer/session";

vi.mock("../../../../../src/ts/controllers/route-controller", () => ({
  navigate: vi.fn(),
}));
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

function stored(layouts: Progress["layouts"]): Progress {
  return { version: 3, layouts, attempts: [] };
}

describe("LessonNotice", () => {
  const [activeLesson, setActiveLesson] = createSignal<number | null>(null);
  const navigateMock = vi.mocked(RouteController.navigate);

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

  it("names the lesson and the accuracy target without attempts", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 3: r u · accuracy phase · target 97%",
    );
  });

  it("shows the speed target once every new key is mastered", () => {
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
      "lesson 3: r u · best 20 · speed phase · target 30 wpm",
    );
    setConfigStore("trainerUnlock", "strict");
    expect(screen.getByRole("button")).toHaveTextContent("target 35 wpm");
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
      "lesson 3: r u · best 32 · accuracy phase · target 97%",
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

  it("reads the target from the unlock setting", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    setConfigStore("trainerUnlock", "strict");
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 3: r u · accuracy phase · target 98%",
    );
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

  it("opens the trainer page on click", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    fireEvent.click(screen.getByRole("button"));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/trainer");
  });

  it("renders nothing for a stored index beyond the lesson list", () => {
    setActiveLesson(LESSONS.length);
    const { container } = render(() => <LessonNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
