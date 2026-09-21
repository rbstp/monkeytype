import { LayoutObject } from "@monkeytype/schemas/layouts";
import { render, screen } from "@solidjs/testing-library";
import { readFileSync } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Keymap } from "../../../../src/ts/components/pages/test/Keymap";
import { setConfigStore } from "../../../../src/ts/config/store";
import * as TestState from "../../../../src/ts/states/test";
import { setTheme } from "../../../../src/ts/states/theme";
import {
  KeySample,
  recordSamples,
  resetKeyStats,
} from "../../../../src/ts/trainer/key-stats";

vi.mock("../../../../src/ts/utils/json-data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLayout: async (name: string) => readLayout(name),
}));
vi.mock("../../../../src/ts/trainer/session", () => ({
  tracksNextKey: () => false,
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

function samples(
  keycode: KeySample["keycode"],
  count: number,
  ms: number,
): KeySample[] {
  return Array.from({ length: count }, () => ({
    keycode,
    shifted: false,
    correct: true,
    spacingMs: ms,
  }));
}

function ring(label: string): string {
  const key = screen.getByText(label, { exact: true });
  return key.style.borderColor;
}

describe("Keymap heat", () => {
  beforeEach(() => {
    vi.spyOn(TestState, "keymapLayoutObject").mockReturnValue(qwerty);
    resetKeyStats();
    setConfigStore("layout", "default");
    setConfigStore("keymapLayout", "overrideSync");
    setConfigStore("keymapMode", "static");
    setConfigStore("keymapStyle", "staggered");
    setConfigStore("keymapLegendStyle", "lowercase");
    setConfigStore("keymapFingerColors", "off");
    setConfigStore("keymapHeat", "off");
    setTheme((theme) => ({ ...theme, sub: "#000000", error: "#ff0000" }));
    recordSamples("qwerty", [
      ...samples("KeyA", 5, 100),
      ...samples("KeyS", 5, 200),
      ...samples("KeyD", 5, 300),
      ...samples("KeyF", 5, 400),
      ...samples("KeyG", 5, 500),
      ...samples("KeyH", 4, 900),
    ]);
  });

  it("leaves every ring alone while the heat is off", () => {
    render(() => <Keymap />);
    expect(ring("a")).toBe("");
    expect(ring("g")).toBe("");
  });

  it("tints the ring of keys with five samples by speed", () => {
    setConfigStore("keymapHeat", "speed");
    render(() => <Keymap />);
    expect(ring("a")).toBe("rgb(0, 0, 0)");
    expect(ring("g")).toBe("rgb(255, 0, 0)");
    expect(ring("d")).toBe("rgb(128, 0, 0)");
    expect(ring("h")).toBe("");
    expect(ring("q")).toBe("");
    setConfigStore("keymapHeat", "off");
    expect(ring("g")).toBe("");
  });

  it("tints by error rate in errors mode", () => {
    recordSamples("qwerty", [
      { keycode: "KeyA", shifted: false, correct: false },
      { keycode: "KeyA", shifted: false, correct: false },
    ]);
    setConfigStore("keymapHeat", "errors");
    render(() => <Keymap />);
    expect(ring("a")).toBe("rgb(255, 0, 0)");
    expect(ring("s")).toBe("rgb(0, 0, 0)");
    expect(ring("h")).toBe("");
  });
});
