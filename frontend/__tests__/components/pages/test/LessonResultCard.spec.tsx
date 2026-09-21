import { LayoutObject } from "@monkeytype/schemas/layouts";
import { CompletedEvent } from "@monkeytype/schemas/results";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { readFileSync } from "fs";
import { createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonResultCard } from "../../../../src/ts/components/pages/test/LessonResultCard";
import { setConfigStore } from "../../../../src/ts/config/store";
import { restartTestEvent } from "../../../../src/ts/events/test";
import * as TestState from "../../../../src/ts/states/test";
import * as Actions from "../../../../src/ts/trainer/actions";
import {
  Attempt,
  LESSONS,
  Progress,
  recordAttempt,
  replaceProgress,
  resetProgress,
} from "../../../../src/ts/trainer/lessons";
import * as Session from "../../../../src/ts/trainer/session";

vi.mock("../../../../src/ts/controllers/route-controller", () => ({
  navigate: vi.fn(),
}));
vi.mock("../../../../src/ts/trainer/session", () => ({
  getActiveLesson: vi.fn(),
}));
vi.mock("../../../../src/ts/trainer/actions", () => ({
  beginLesson: vi.fn(),
}));
vi.mock("../../../../src/ts/utils/json-data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLayout: async (name: string) => readLayout(name),
}));

function readLayout(name: string): LayoutObject {
  return JSON.parse(
    readFileSync(
      `${import.meta.dirname}/../../../../static/layouts/${name}.json`,
      "utf-8",
    ),
  ) as LayoutObject;
}

const qwerty = readLayout("qwerty");
const dvorak = readLayout("dvorak");

const resultAt = 1_000_000;

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    lesson: "e-i",
    layout: "qwerty",
    wpm: 35,
    acc: 98,
    perKey: {
      KeyE: { total: 20, errors: 0 },
      KeyI: { total: 20, errors: 0 },
    },
    ts: resultAt + 5,
    ...overrides,
  };
}

function stored(attempts: Attempt[], unlocked = 1): Progress {
  return {
    version: 3,
    layouts: {
      qwerty: {
        current: "e-i",
        unlocked: LESSONS[unlocked]?.id ?? "",
        best: {},
      },
    },
    attempts,
  };
}

describe("LessonResultCard", () => {
  const [activeLesson, setActiveLesson] = createSignal<number | null>(null);
  const beginLessonMock = vi.mocked(Actions.beginLesson);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Session.getActiveLesson).mockImplementation(() => activeLesson());
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(qwerty);
    beginLessonMock.mockResolvedValue(true);
    setActiveLesson(null);
    TestState.setLastResult(null);
    resetProgress();
    setConfigStore("trainerUnlock", "normal");
    setConfigStore("layout", "default");
    setConfigStore("keymapLayout", "overrideSync");
  });

  const finish = (): void => {
    TestState.setLastResult({
      wpm: 35,
      acc: 98,
      timestamp: resultAt,
    } as CompletedEvent);
  };

  it("renders nothing without a lesson", () => {
    finish();
    const { container } = render(() => <LessonResultCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing without a result", () => {
    setActiveLesson(1);
    replaceProgress(stored([attempt()]));
    const { container } = render(() => <LessonResultCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says when the attempt was not recorded", () => {
    setActiveLesson(1);
    finish();
    render(() => <LessonResultCard />);
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "attempt not recorded",
    );
    replaceProgress(stored([attempt({ ts: resultAt - 1 })]));
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "attempt not recorded",
    );
  });

  it("prints the wpm shortfall", () => {
    setActiveLesson(1);
    finish();
    replaceProgress(stored([attempt({ wpm: 26.6 })]));
    render(() => <LessonResultCard />);
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "27 wpm, 3 short of 30",
    );
  });

  it("prints the accuracy shortfall", () => {
    setActiveLesson(1);
    finish();
    replaceProgress(stored([attempt({ acc: 95.9 })]));
    render(() => <LessonResultCard />);
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "accuracy 95%, 2 short of 97%",
    );
  });

  it("names the weak key once the bar is passed", () => {
    setActiveLesson(1);
    finish();
    replaceProgress(
      stored([
        attempt({
          perKey: {
            KeyE: { total: 20, errors: 0 },
            KeyI: { total: 8, errors: 0 },
          },
        }),
      ]),
    );
    render(() => <LessonResultCard />);
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "passed the bar, i needs 12 more samples",
    );
    replaceProgress(
      stored([
        attempt({
          perKey: {
            KeyE: { total: 20, errors: 0 },
            KeyI: { total: 50, errors: 4 },
          },
        }),
      ]),
    );
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "passed the bar, i has 4 errors in 50 samples, above 3%",
    );
  });

  it("asks for one more pass under the strict window", () => {
    setConfigStore("trainerUnlock", "strict");
    setActiveLesson(1);
    finish();
    replaceProgress(stored([attempt({ wpm: 40, acc: 99 })]));
    render(() => <LessonResultCard />);
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "passed the bar, pass once more to unlock",
    );
  });

  it("prints the unlocked lesson and updates when progress lands", () => {
    setActiveLesson(1);
    finish();
    render(() => <LessonResultCard />);
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "attempt not recorded",
    );
    recordAttempt(attempt());
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "lesson 3 unlocked: r u",
    );
  });

  it("names the unlocked lesson and the weak key by the input layout", () => {
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(dvorak);
    setActiveLesson(1);
    finish();
    replaceProgress(stored([attempt()]));
    render(() => <LessonResultCard />);
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "lesson 3 unlocked: p g",
    );
    replaceProgress(
      stored([
        attempt({
          perKey: {
            KeyE: { total: 20, errors: 0 },
            KeyI: { total: 8, errors: 0 },
          },
        }),
      ]),
    );
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "passed the bar, c needs 12 more samples",
    );
  });

  it("says passed on the last lesson", () => {
    const last = LESSONS.length - 1;
    setActiveLesson(last);
    finish();
    replaceProgress(
      stored([
        attempt({
          lesson: LESSONS[last]?.id ?? "",
          perKey: Object.fromEntries(
            (LESSONS[last]?.newKeys ?? []).map((keycode) => [
              keycode,
              { total: 20, errors: 0 },
            ]),
          ),
        }),
      ]),
    );
    render(() => <LessonResultCard />);
    expect(screen.getByTestId("lessonresult")).toHaveTextContent(
      "lesson passed",
    );
    expect(screen.queryByText("next")).toBeNull();
  });

  it("retries through the restart event once", () => {
    setActiveLesson(1);
    finish();
    replaceProgress(stored([attempt()]));
    render(() => <LessonResultCard />);
    const restarts = vi.fn();
    const unsubscribe = restartTestEvent.subscribe(restarts);
    fireEvent.click(screen.getByText("retry"));
    unsubscribe();
    expect(restarts).toHaveBeenCalledTimes(1);
    expect(beginLessonMock).not.toHaveBeenCalled();
  });

  it("disables next while locked and begins the next lesson once unlocked", () => {
    setActiveLesson(1);
    finish();
    replaceProgress(stored([attempt({ wpm: 20 })], 1));
    render(() => <LessonResultCard />);
    const next = screen.getByText("next").closest("button") as HTMLElement;
    expect(next).toBeDisabled();

    replaceProgress(stored([attempt()], 2));
    expect(next).not.toBeDisabled();
    fireEvent.click(next);
    expect(beginLessonMock).toHaveBeenCalledTimes(1);
    expect(beginLessonMock).toHaveBeenCalledWith(2);
  });
});
