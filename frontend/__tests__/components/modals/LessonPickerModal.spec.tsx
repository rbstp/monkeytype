import { LayoutObject } from "@monkeytype/schemas/layouts";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { readFileSync } from "fs";
import { createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonPickerModal } from "../../../src/ts/components/modals/LessonPickerModal";
import { setConfigStore } from "../../../src/ts/config/store";
import { isModalOpen, showModal } from "../../../src/ts/states/modals";
import * as TestState from "../../../src/ts/states/test";
import * as Actions from "../../../src/ts/trainer/actions";
import {
  Attempt,
  LESSONS,
  replaceProgress,
  resetProgress,
} from "../../../src/ts/trainer/lessons";
import * as Session from "../../../src/ts/trainer/session";

vi.mock("../../../src/ts/controllers/route-controller", () => ({
  navigate: vi.fn(),
}));
vi.mock("../../../src/ts/trainer/session", () => ({
  getActiveLesson: vi.fn(),
}));
vi.mock("../../../src/ts/trainer/actions", () => ({
  beginLesson: vi.fn(),
}));
vi.mock("../../../src/ts/utils/json-data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLayout: async (name: string) => readLayout(name),
}));

function readLayout(name: string): LayoutObject {
  return JSON.parse(
    readFileSync(
      `${import.meta.dirname}/../../../static/layouts/${name}.json`,
      "utf-8",
    ),
  ) as LayoutObject;
}

const qwerty = readLayout("qwerty");
const dvorak = readLayout("dvorak");

const rows = (): HTMLElement[] => screen.getAllByTestId("lessonPickerRow");

describe("LessonPickerModal", () => {
  const [activeLesson, setActiveLesson] = createSignal<number | null>(null);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Session.getActiveLesson).mockImplementation(() => activeLesson());
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(qwerty);
    setActiveLesson(null);
    resetProgress();
    setConfigStore("layout", "default");
    setConfigStore("keymapLayout", "overrideSync");
    showModal("lessonPicker");
  });

  it("lists the lessons the layout offers, numbered and named by its legends", () => {
    render(() => <LessonPickerModal />);
    expect(rows()).toHaveLength(18);
    expect(rows()[0]).toHaveTextContent("1");
    expect(rows()[0]).toHaveTextContent("a s d f j k l ;");
    expect(rows()[17]).toHaveTextContent("18");
    expect(rows()[17]).toHaveTextContent("numbers");
    expect(screen.queryByText("è à ù")).toBeNull();
  });

  it("shows the accents track on canadian_french and follows the layout legends", () => {
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(dvorak);
    setConfigStore("keymapLayout", "canadian_french");
    render(() => <LessonPickerModal />);
    expect(rows()).toHaveLength(LESSONS.length);
    expect(rows()[0]).toHaveTextContent("a o e u h t n s");
    expect(rows()[18]).toHaveTextContent("è à ù");
  });

  it("marks each row with its state and disables the locked ones", () => {
    replaceProgress({
      version: 3,
      layouts: {
        qwerty: { current: "r-u", unlocked: "t-y", best: { "home-row": 44.4 } },
      },
      attempts: [],
    });
    setActiveLesson(1);
    render(() => <LessonPickerModal />);
    expect(
      rows()
        .map((row) => row.getAttribute("data-lesson-state"))
        .slice(0, 5),
    ).toEqual(["unlocked", "active", "current", "unlocked", "locked"]);
    expect(rows()[0]).not.toBeDisabled();
    expect(rows()[4]).toBeDisabled();
    expect(rows()[0]).toHaveTextContent("best 44");
  });

  it("shows what is holding the current lesson on its row and on no other", () => {
    const attempt: Attempt = {
      lesson: "e-i",
      layout: "qwerty",
      wpm: 40,
      acc: 99,
      perKey: {},
      ts: 1,
    };
    replaceProgress({
      version: 3,
      layouts: { qwerty: { current: "e-i", unlocked: "e-i", best: {} } },
      attempts: [attempt],
    });
    render(() => <LessonPickerModal />);
    const blockers = screen.getAllByTestId("lessonBlocker");
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toHaveTextContent(
      "accuracy phase: e needs 20 more samples",
    );
    expect(rows()[1]).toContainElement(blockers[0] as HTMLElement);
  });

  it("says nothing when the current lesson has nothing short", () => {
    const attempt: Attempt = {
      lesson: "e-i",
      layout: "qwerty",
      wpm: 40,
      acc: 99,
      perKey: {
        KeyE: { total: 20, errors: 0 },
        KeyI: { total: 20, errors: 0 },
      },
      ts: 1,
    };
    replaceProgress({
      version: 3,
      layouts: { qwerty: { current: "e-i", unlocked: "e-i", best: {} } },
      attempts: [attempt],
    });
    render(() => <LessonPickerModal />);
    expect(screen.queryAllByTestId("lessonBlocker")).toHaveLength(0);
  });

  it("starts the chosen lesson and closes", () => {
    replaceProgress({
      version: 3,
      layouts: { qwerty: { current: "home-row", unlocked: "t-y", best: {} } },
      attempts: [],
    });
    render(() => <LessonPickerModal />);
    fireEvent.click(rows()[2] as HTMLElement);
    expect(Actions.beginLesson).toHaveBeenCalledTimes(1);
    expect(Actions.beginLesson).toHaveBeenCalledWith(2);
    expect(isModalOpen("lessonPicker")).toBe(false);
  });

  it("leaves a locked row alone", () => {
    render(() => <LessonPickerModal />);
    fireEvent.click(rows()[4] as HTMLElement);
    expect(Actions.beginLesson).not.toHaveBeenCalled();
    expect(isModalOpen("lessonPicker")).toBe(true);
  });
});
