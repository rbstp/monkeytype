import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import {
  charToFinger,
  Finger,
  fingerColors,
  keycodeToFinger,
  shiftFingerFor,
} from "../../src/ts/trainer/finger";
import { qwertyKeycodeKeymap } from "../../src/ts/constants/keys";

function loadLayout(name: string): LayoutObject {
  return JSON.parse(
    readFileSync(
      `${import.meta.dirname}/../../static/layouts/${name}.json`,
      "utf-8",
    ),
  ) as LayoutObject;
}

const qwerty = loadLayout("qwerty");
const swedishDvorak = loadLayout("swedish_dvorak");

describe("finger", () => {
  it("covers every keycode of the main rows", () => {
    for (const keycode of qwertyKeycodeKeymap.flat()) {
      expect(keycodeToFinger[keycode], keycode).toBeDefined();
    }
  });

  it("maps qwerty home row", () => {
    const expected: Record<string, Finger> = {
      a: "LP",
      s: "LR",
      d: "LM",
      f: "LI",
      g: "LI",
      h: "RI",
      j: "RI",
      k: "RM",
      l: "RR",
      ";": "RP",
      "'": "RP",
      " ": "thumb",
    };
    for (const [char, finger] of Object.entries(expected)) {
      expect(charToFinger(char, qwerty), char).toEqual(finger);
    }
  });

  it("handles iso keys", () => {
    expect(charToFinger("*", swedishDvorak)).toEqual("RP");
    expect(charToFinger("<", swedishDvorak)).toEqual("LP");
  });

  it("returns undefined for unknown chars", () => {
    expect(charToFinger("é", qwerty)).toBeUndefined();
  });

  it("picks the opposite shift hand for shifted legends", () => {
    expect(shiftFingerFor("A", qwerty)).toEqual("RP");
    expect(shiftFingerFor("J", qwerty)).toEqual("LP");
    expect(shiftFingerFor("a", qwerty)).toBeUndefined();
    expect(shiftFingerFor(" ", qwerty)).toBeUndefined();
  });

  it("produces distinct hex colors per finger", () => {
    const theme = {
      main: "#e2b714",
      subAlt: "#2c2e31",
      sub: "#646669",
      bg: "#323437",
    };
    const colors = (["LP", "LR", "LM", "LI"] as Finger[]).map(
      (finger) => fingerColors(finger, theme).bg,
    );
    expect(new Set(colors).size).toEqual(4);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("canadian french layout", () => {
  const layout = loadLayout("canadian_french");

  it("keeps the qwerty finger assignment", () => {
    expect(charToFinger("é", layout)).toEqual("RP");
    expect(charToFinger("ç", layout)).toEqual("LM");
    expect(charToFinger("l", layout)).toEqual("RR");
    expect(shiftFingerFor("É", layout)).toEqual("LP");
  });
});
