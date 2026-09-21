import { LayoutObject } from "@monkeytype/schemas/layouts";
import { render, screen } from "@solidjs/testing-library";
import { readFileSync } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WeakKeysPanel } from "../../../../src/ts/components/pages/test/WeakKeysPanel";
import { setConfigStore } from "../../../../src/ts/config/store";
import * as TestState from "../../../../src/ts/states/test";
import {
  recordConfusions,
  resetConfusions,
} from "../../../../src/ts/trainer/confusions";
import {
  KeySample,
  recordSamples,
  resetKeyStats,
} from "../../../../src/ts/trainer/key-stats";

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

const wrong = (
  keycode: KeySample["keycode"],
  typed: KeySample["keycode"],
): KeySample => ({ keycode, shifted: false, correct: false, typed });

describe("WeakKeysPanel", () => {
  beforeEach(() => {
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(qwerty);
    TestState.setLastResult(null);
    resetKeyStats();
    resetConfusions();
    setConfigStore("layout", "default");
    setConfigStore("keymapLayout", "overrideSync");
    recordSamples(
      "qwerty",
      Array.from({ length: 6 }, () => ({
        keycode: "KeyD" as const,
        shifted: false,
        correct: false,
        spacingMs: 200,
      })),
    );
  });

  it("hides the confusions row below the minimum", () => {
    recordConfusions("qwerty", [wrong("KeyD", "KeyK"), wrong("KeyD", "KeyK")]);
    render(() => <WeakKeysPanel />);
    expect(screen.getByText("weak keys")).toBeInTheDocument();
    expect(screen.queryByTestId("confusions")).toBeNull();
  });

  it("lists up to four pairs with their kind and count", () => {
    recordConfusions("qwerty", [
      ...Array.from({ length: 5 }, () => wrong("KeyD", "KeyK")),
      ...Array.from({ length: 3 }, () => wrong("KeyA", "KeyS")),
      ...Array.from({ length: 3 }, () => wrong("KeyF", "KeyJ")),
      ...Array.from({ length: 4 }, () => wrong("KeyE", "KeyD")),
      ...Array.from({ length: 3 }, () => wrong("KeyQ", "KeyM")),
    ]);
    render(() => <WeakKeysPanel />);
    const row = screen.getByTestId("confusions");
    expect(row).toHaveTextContent("confusions");
    expect(row).toHaveTextContent("k for d (mirror hand) ×5");
    expect(row).toHaveTextContent("d for e (same finger) ×4");
    expect(row).toHaveTextContent("s for a (neighbour) ×3");
    expect(row).toHaveTextContent("j for f (mirror hand) ×3");
    expect(row).not.toHaveTextContent("m for q");
    expect(screen.getByRole("list")).toHaveTextContent(
      "You press k when you mean d (mirror hand, 5 times)",
    );
  });
});
