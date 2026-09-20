import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonNotice } from "../../../../../src/ts/components/pages/test/modes-notice/LessonNotice";
import * as RouteController from "../../../../../src/ts/controllers/route-controller";
import * as Lessons from "../../../../../src/ts/trainer/lessons";
import { Attempt, Progress } from "../../../../../src/ts/trainer/lessons";
import * as Session from "../../../../../src/ts/trainer/session";

vi.mock("../../../../../src/ts/controllers/route-controller", () => ({
  navigate: vi.fn(),
}));
vi.mock("../../../../../src/ts/trainer/session", () => ({
  getActiveLesson: vi.fn(),
}));

function attempt(lesson: number, wpm: number): Attempt {
  return { lesson, wpm, acc: 98, perKey: {}, ts: 1 };
}

describe("LessonNotice", () => {
  const [activeLesson, setActiveLesson] = createSignal<number | null>(null);
  const [progress, setProgress] = createSignal<Progress>({
    version: 1,
    current: 0,
    unlocked: 0,
    attempts: [],
  });
  const navigateMock = vi.mocked(RouteController.navigate);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Session.getActiveLesson).mockImplementation(() => activeLesson());
    vi.spyOn(Lessons, "progress").mockImplementation(() => progress());
    setActiveLesson(null);
    setProgress({ version: 1, current: 0, unlocked: 0, attempts: [] });
  });

  it("renders nothing without an active lesson", () => {
    const { container } = render(() => <LessonNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the lesson and the target without attempts", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 3: r u · target 30 / 97%",
    );
  });

  it("reads best from the active lesson only", () => {
    setActiveLesson(2);
    setProgress({
      version: 1,
      current: 2,
      unlocked: 2,
      attempts: [attempt(1, 55), attempt(2, 27.4), attempt(2, 31.6)],
    });
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).toHaveTextContent(
      "lesson 3: r u · best 32 · target 30 / 97%",
    );
  });

  it("updates when a new best is stored", () => {
    setActiveLesson(2);
    render(() => <LessonNotice />);
    expect(screen.getByRole("button")).not.toHaveTextContent("best");
    setProgress({
      version: 1,
      current: 2,
      unlocked: 2,
      attempts: [attempt(2, 29)],
    });
    expect(screen.getByRole("button")).toHaveTextContent("best 29");
  });

  it("appears and disappears with the active lesson", () => {
    const { container } = render(() => <LessonNotice />);
    expect(container).toBeEmptyDOMElement();
    setActiveLesson(0);
    expect(screen.getByRole("button")).toHaveTextContent("lesson 1: home row");
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
    setActiveLesson(Lessons.LESSONS.length);
    const { container } = render(() => <LessonNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
