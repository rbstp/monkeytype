import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { EventLog, TestEventNoMs } from "../../src/ts/test/events/types";
import {
  accuracy,
  applySamples,
  fingerSummary,
  KeySample,
  layoutStatsName,
  samplesFromEventLog,
  worstKeys,
} from "../../src/ts/trainer/key-stats";

const qwerty = JSON.parse(
  readFileSync(
    `${import.meta.dirname}/../../static/layouts/qwerty.json`,
    "utf-8",
  ),
) as LayoutObject;

function input(
  testMs: number,
  wordIndex: number,
  charIndex: number,
  data: string,
  correct: boolean,
  extra: Record<string, true> = {},
): TestEventNoMs {
  return {
    type: "input",
    testMs,
    data: {
      inputType: "insertText",
      data,
      correct,
      wordIndex,
      charIndex,
      inputValue: "",
      ...extra,
    },
  };
}

function log(events: TestEventNoMs[]): EventLog {
  return {
    version: 1,
    events,
    context: {
      targetWords: ["as ", "df "],
      mode: "words",
      mode2: "10",
      bailedOut: false,
      koreanStatus: false,
    },
  };
}

describe("key-stats", () => {
  describe("layoutStatsName", () => {
    it("passes a resolved name through", () => {
      expect(layoutStatsName("canadian_french", [])).toBe("canadian_french");
      expect(layoutStatsName("qwerty", ["58008"])).toBe("qwerty");
    });

    it("appends _mirrored when layout_mirror is active", () => {
      expect(layoutStatsName("qwerty", ["layout_mirror"])).toBe(
        "qwerty_mirrored",
      );
      expect(layoutStatsName("canadian_french", ["layout_mirror"])).toBe(
        "canadian_french_mirrored",
      );
    });
  });

  describe("samplesFromEventLog", () => {
    it("attributes samples to the expected key", () => {
      const samples = samplesFromEventLog(
        log([
          input(0, 0, 0, "a", true),
          input(200, 0, 1, "x", false, { inputStopped: true }),
          input(300, 0, 1, "s", true),
          input(400, 0, 2, " ", true, { commitsWord: true }),
          input(500, 1, 0, "d", true),
          input(600, 1, 1, " ", false, { commitsWord: true }),
          input(700, 1, 3, "z", false),
          input(700, 1, 1, "f", true, { automatic: true }),
        ]),
        qwerty,
      );

      expect(samples).toEqual<KeySample[]>([
        { keycode: "KeyA", shifted: false, correct: true },
        { keycode: "KeyS", shifted: false, correct: false, spacingMs: 200 },
        { keycode: "KeyS", shifted: false, correct: true, spacingMs: 100 },
        { keycode: "Space", shifted: false, correct: true, spacingMs: 100 },
        { keycode: "KeyD", shifted: false, correct: true, spacingMs: 100 },
        { keycode: "KeyF", shifted: false, correct: false, spacingMs: 100 },
      ]);
    });

    it("skips extra characters at the separator and flags shifted keys", () => {
      const samples = samplesFromEventLog(
        {
          ...log([input(0, 0, 0, "A", true), input(100, 0, 2, "x", false)]),
          context: { ...log([]).context, targetWords: ["As ", "df "] },
        },
        qwerty,
      );

      expect(samples).toEqual<KeySample[]>([
        { keycode: "KeyA", shifted: true, correct: true },
      ]);
    });

    it("ignores deletes and events without a target", () => {
      const samples = samplesFromEventLog(
        log([
          {
            type: "input",
            testMs: 0,
            data: {
              inputType: "deleteContentBackward",
              wordIndex: 0,
              charIndex: 1,
              inputValue: "",
            },
          },
          input(100, 5, 0, "a", true),
        ]),
        qwerty,
      );
      expect(samples).toEqual([]);
    });
  });

  describe("applySamples", () => {
    it("tracks totals, errors and a penalised moving average", () => {
      const stats = applySamples(
        {},
        [
          { keycode: "KeyS", shifted: false, correct: false, spacingMs: 200 },
          { keycode: "KeyS", shifted: false, correct: true, spacingMs: 100 },
          { keycode: "KeyA", shifted: false, correct: true },
          { keycode: "KeyD", shifted: false, correct: false },
        ],
        1000,
      );

      expect(stats.KeyS).toEqual({
        ema: 2650,
        total: 2,
        errors: 1,
        lastSeen: 1000,
      });
      expect(stats.KeyA).toEqual({
        ema: 0,
        total: 1,
        errors: 0,
        lastSeen: 1000,
      });
      expect(stats.KeyD?.ema).toEqual(5000);
      expect(accuracy(stats.KeyS ?? { total: 0, errors: 0 })).toEqual(50);
    });
  });

  describe("worstKeys", () => {
    it("ranks by average and skips keys with few samples", () => {
      const many = (keycode: "KeyA" | "KeyS", ms: number): KeySample[] =>
        Array.from({ length: 5 }, () => ({
          keycode,
          shifted: false,
          correct: true,
          spacingMs: ms,
        }));
      const stats = applySamples(
        {},
        [
          ...many("KeyA", 300),
          ...many("KeyS", 500),
          { keycode: "KeyD", shifted: false, correct: false, spacingMs: 900 },
        ],
        0,
      );

      expect(worstKeys(stats, 5).map((key) => key.keycode)).toEqual([
        "KeyS",
        "KeyA",
      ]);
    });
  });

  describe("fingerSummary", () => {
    it("aggregates per finger", () => {
      const stats = applySamples(
        {},
        [
          { keycode: "KeyA", shifted: false, correct: true, spacingMs: 100 },
          { keycode: "KeyQ", shifted: false, correct: false, spacingMs: 100 },
          { keycode: "KeyJ", shifted: false, correct: true, spacingMs: 100 },
        ],
        0,
      );
      const summary = fingerSummary(stats);

      expect(summary.LP).toEqual({ total: 2, errors: 1, avgMs: 2600 });
      expect(summary.RI.total).toEqual(1);
      expect(summary.RP.total).toEqual(0);
    });
  });
});
