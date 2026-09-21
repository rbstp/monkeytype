import { readFileSync } from "fs";
import { beforeEach, describe, expect, it } from "vitest";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { setConfigStore } from "../../src/ts/config/store";
import {
  DEAD_KEYS,
  deadKeyFor,
  deadKeyTable,
  hasDeadKeys,
} from "../../src/ts/trainer/dead-keys";
import {
  Attempt,
  lessonIndex,
  LESSONS,
  progress,
  replaceProgress,
  resetProgress,
} from "../../src/ts/trainer/lessons";

function readLayout(name: string): LayoutObject {
  return JSON.parse(
    readFileSync(
      `${import.meta.dirname}/../../static/layouts/${name}.json`,
      "utf-8",
    ),
  ) as LayoutObject;
}

const qwerty = readLayout("qwerty");
const canadianFrench = readLayout("canadian_french");

describe("dead-keys", () => {
  it("resolves the canadian_french accents to a dead key and a base key", () => {
    expect(deadKeyFor("è", canadianFrench)).toEqual({
      dead: "Quote",
      deadLayer: 0,
      legend: "`",
      base: "KeyE",
    });
    expect(deadKeyFor("à", canadianFrench)?.base).toBe("KeyA");
    expect(deadKeyFor("ù", canadianFrench)?.base).toBe("KeyU");
    expect(deadKeyFor("ô", canadianFrench)).toEqual({
      dead: "BracketLeft",
      deadLayer: 0,
      legend: "^",
      base: "KeyO",
    });
    expect(deadKeyFor("ü", canadianFrench)).toEqual({
      dead: "BracketRight",
      deadLayer: 1,
      legend: "¨",
      base: "KeyU",
    });
    expect(Object.keys(DEAD_KEYS["canadian_french"] ?? {}).sort()).toEqual(
      [..."èàùêâîôûëïü"].sort(),
    );
  });

  it("leaves direct legends and unknown characters alone", () => {
    expect(deadKeyFor("é", canadianFrench)).toBeUndefined();
    expect(deadKeyFor("ç", canadianFrench)).toBeUndefined();
    expect(deadKeyFor("e", canadianFrench)).toBeUndefined();
  });

  it("resolves nothing on a layout without a table", () => {
    expect(deadKeyTable(qwerty)).toBeUndefined();
    expect(deadKeyFor("è", qwerty)).toBeUndefined();
    expect(deadKeyTable("qwerty")).toBeUndefined();
    expect(deadKeyTable("canadian_french")).toBe(DEAD_KEYS["canadian_french"]);
    expect(deadKeyTable(canadianFrench)).toBe(DEAD_KEYS["canadian_french"]);
    expect(hasDeadKeys("canadian_french")).toBe(true);
    expect(hasDeadKeys("dvorak")).toBe(false);
  });

  describe("hidden lessons", () => {
    const passing = (lesson: string, layout: string): Attempt => ({
      lesson,
      layout,
      wpm: 40,
      acc: 100,
      perKey: Object.fromEntries(
        (LESSONS[lessonIndex(lesson)]?.newKeys ?? []).map((keycode) => [
          keycode,
          { total: 20, errors: 0 },
        ]),
      ),
      ts: 0,
    });

    beforeEach(() => {
      setConfigStore("layout", "default");
      setConfigStore("keymapLayout", "overrideSync");
      resetProgress();
    });

    it("skips the accents track on a layout that cannot type it", () => {
      const shifted = {
        current: "shifted-punctuation",
        unlocked: "shifted-punctuation",
        best: {},
      };
      replaceProgress({
        version: 3,
        layouts: { qwerty: shifted, canadian_french: shifted },
        attempts: [
          passing("shifted-punctuation", "qwerty"),
          passing("shifted-punctuation", "canadian_french"),
        ],
      });
      expect(progress().layouts["qwerty"]?.unlocked).toBe("numbers");
      expect(progress().layouts["canadian_french"]?.unlocked).toBe(
        "accents-direct",
      );
    });
  });
});
