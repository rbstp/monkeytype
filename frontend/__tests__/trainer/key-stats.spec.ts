import { readFileSync } from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutObject } from "@monkeytype/schemas/layouts";
import { EventLog, TestEventNoMs } from "../../src/ts/test/events/types";
import {
  accuracy,
  applySamples,
  fingerSummary,
  KeySample,
  keyLabel,
  layoutStatsName,
  samplesFromEventLog,
  upgradeKeyStats,
  worstKeys,
} from "../../src/ts/trainer/key-stats";

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

    it("times the dead key of a pair and leaves the base key untimed", () => {
      const samples = samplesFromEventLog(
        {
          ...log([input(0, 0, 0, "a", true), input(400, 0, 1, "è", true)]),
          context: { ...log([]).context, targetWords: ["aè "] },
        },
        canadianFrench,
      );
      expect(samples[1]).toMatchObject({ keycode: "Quote", spacingMs: 400 });
      expect(samples[2]).toEqual({
        keycode: "KeyE",
        shifted: false,
        correct: true,
      });
    });

    it("splits an accented character into its dead key and its base key", () => {
      const samples = samplesFromEventLog(
        {
          ...log([
            input(0, 0, 0, "è", true),
            input(300, 0, 1, "s", true),
            input(500, 0, 2, "ü", false),
            input(700, 0, 3, "é", true),
          ]),
          context: { ...log([]).context, targetWords: ["èsüé "] },
        },
        canadianFrench,
      );

      expect(samples).toEqual<KeySample[]>([
        { keycode: "Quote", shifted: false, correct: true },
        { keycode: "KeyE", shifted: false, correct: true },
        { keycode: "KeyS", shifted: false, correct: true, spacingMs: 300 },
        {
          keycode: "BracketRight",
          shifted: true,
          correct: false,
          spacingMs: 200,
        },
        { keycode: "KeyU", shifted: false, correct: false },
        { keycode: "Slash", shifted: false, correct: true, spacingMs: 200 },
      ]);
    });

    it("drops an accented character the layout cannot type", () => {
      expect(
        samplesFromEventLog(
          {
            ...log([input(0, 0, 0, "è", true)]),
            context: { ...log([]).context, targetWords: ["è "] },
          },
          qwerty,
        ),
      ).toEqual([]);
    });

    it("ignores events without a target", () => {
      const samples = samplesFromEventLog(
        log([input(100, 5, 0, "a", true)]),
        qwerty,
      );
      expect(samples).toEqual([]);
    });

    it("advances the clock on deletes and flags the next insert as recovery", () => {
      const samples = samplesFromEventLog(
        log([
          input(0, 0, 0, "a", true),
          input(100, 0, 1, "x", false),
          {
            type: "input",
            testMs: 900,
            data: {
              inputType: "deleteContentBackward",
              wordIndex: 0,
              charIndex: 1,
              inputValue: "",
            },
          },
          input(1000, 0, 1, "s", true),
          input(1100, 0, 2, " ", true, { commitsWord: true }),
        ]),
        qwerty,
      );

      expect(samples).toEqual<KeySample[]>([
        { keycode: "KeyA", shifted: false, correct: true },
        { keycode: "KeyS", shifted: false, correct: false, spacingMs: 100 },
        {
          keycode: "KeyS",
          shifted: false,
          correct: true,
          spacingMs: 100,
          recovery: true,
        },
        { keycode: "Space", shifted: false, correct: true, spacingMs: 100 },
      ]);
    });

    it("treats an automatic delete on error like a backspace", () => {
      const samples = samplesFromEventLog(
        log([
          input(0, 0, 0, "a", true),
          input(100, 0, 1, "x", false),
          {
            type: "input",
            testMs: 100,
            data: {
              inputType: "deleteContentBackward",
              wordIndex: 0,
              charIndex: 1,
              inputValue: "",
              automatic: true,
            },
          },
          input(400, 0, 1, "s", true),
        ]),
        qwerty,
      );
      expect(samples[2]).toEqual({
        keycode: "KeyS",
        shifted: false,
        correct: true,
        spacingMs: 300,
        recovery: true,
      });
    });

    it("keeps recovering across held backspaces and a leading delete", () => {
      const del = (testMs: number): TestEventNoMs => ({
        type: "input",
        testMs,
        data: {
          inputType: "deleteContentBackward",
          wordIndex: 0,
          charIndex: 0,
          inputValue: "",
        },
      });
      const samples = samplesFromEventLog(
        log([del(0), del(50), del(100), input(300, 0, 0, "a", true)]),
        qwerty,
      );
      expect(samples).toEqual<KeySample[]>([
        {
          keycode: "KeyA",
          shifted: false,
          correct: true,
          spacingMs: 200,
          recovery: true,
        },
      ]);
    });
  });

  describe("applySamples", () => {
    it("keeps speed and error rate apart", () => {
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
        emaMs: 100,
        timed: 1,
        errRate: 0.5,
        total: 2,
        errors: 1,
        lastSeen: 1000,
      });
      expect(stats.KeyA).toEqual({
        emaMs: 0,
        timed: 0,
        errRate: 0,
        total: 1,
        errors: 0,
        lastSeen: 1000,
      });
      expect(stats.KeyD).toMatchObject({ emaMs: 0, timed: 0, errRate: 1 });
      expect(accuracy(stats.KeyS ?? { total: 0, errors: 0 })).toEqual(50);
    });

    it("leaves recoveries out of the speed", () => {
      const stats = applySamples(
        {},
        [
          { keycode: "KeyS", shifted: false, correct: true, spacingMs: 100 },
          {
            keycode: "KeyS",
            shifted: false,
            correct: true,
            spacingMs: 2000,
            recovery: true,
          },
        ],
        0,
      );
      expect(stats.KeyS).toMatchObject({ emaMs: 100, timed: 1, total: 2 });
    });

    it("caps a pause at three times the running average", () => {
      const stats = applySamples(
        {},
        [
          { keycode: "KeyS", shifted: false, correct: true, spacingMs: 100 },
          { keycode: "KeyS", shifted: false, correct: true, spacingMs: 9000 },
        ],
        0,
      );
      expect(stats.KeyS?.emaMs).toEqual(200);
    });
  });

  describe("keyLabel", () => {
    const stat = {
      emaMs: 100,
      timed: 10,
      errRate: 0,
      total: 10,
      errors: 0,
      lastSeen: 0,
    };

    it("prefers error-prone over slow", () => {
      expect(keyLabel(stat)).toBeUndefined();
      expect(keyLabel({ ...stat, emaMs: 700 })).toBe("slow");
      expect(keyLabel({ ...stat, emaMs: 700, errRate: 0.2 })).toBe(
        "error-prone",
      );
    });

    it("waits for enough samples", () => {
      expect(keyLabel({ ...stat, total: 3, errRate: 0.5 })).toBeUndefined();
      expect(keyLabel({ ...stat, timed: 2, emaMs: 900 })).toBeUndefined();
    });
  });

  describe("upgradeKeyStats", () => {
    it("clamps a v1 stat with more errors than samples", () => {
      const upgraded = upgradeKeyStats({
        version: 1,
        layouts: {
          qwerty: { KeyA: { ema: 100, total: 1, errors: 3, lastSeen: 0 } },
        },
      });
      expect(upgraded.layouts["qwerty"]?.["KeyA"]).toMatchObject({
        emaMs: 0,
        timed: 0,
        errRate: 1,
      });
    });

    it("takes the v1 error penalty back out of the average", () => {
      const upgraded = upgradeKeyStats({
        version: 1,
        layouts: {
          qwerty: {
            KeyA: { ema: 2650, total: 2, errors: 1, lastSeen: 5 },
            KeyS: { ema: 100, total: 4, errors: 0, lastSeen: 6 },
          },
        },
      });
      expect(upgraded).toEqual({
        version: 2,
        layouts: {
          qwerty: {
            KeyA: {
              emaMs: 150,
              timed: 1,
              errRate: 0.5,
              total: 2,
              errors: 1,
              lastSeen: 5,
            },
            KeyS: {
              emaMs: 100,
              timed: 4,
              errRate: 0,
              total: 4,
              errors: 0,
              lastSeen: 6,
            },
          },
        },
      });
    });
  });

  describe("worstKeys", () => {
    const many = (
      keycode: "KeyA" | "KeyS" | "KeyF",
      ms: number,
      misses = 0,
    ): KeySample[] =>
      Array.from({ length: 5 }, (_value, index) => ({
        keycode,
        shifted: false,
        correct: index >= misses,
        spacingMs: ms,
      }));

    it("ranks errors before speed and skips keys with few samples", () => {
      const stats = applySamples(
        {},
        [
          ...many("KeyA", 300),
          ...many("KeyS", 500),
          ...many("KeyF", 200, 1),
          { keycode: "KeyD", shifted: false, correct: false, spacingMs: 900 },
        ],
        0,
      );

      expect(worstKeys(stats, 5).map((key) => key.keycode)).toEqual([
        "KeyF",
        "KeyS",
        "KeyA",
      ]);
    });

    it("ranks labelled keys ahead of a small error rate", () => {
      const stats = applySamples(
        {},
        [
          ...Array.from({ length: 20 }, (_value, index) => ({
            keycode: "KeyA" as const,
            shifted: false,
            correct: index !== 0,
            spacingMs: 200,
          })),
          ...many("KeyS", 800),
        ],
        0,
      );
      expect(worstKeys(stats, 1).map((key) => key.keycode)).toEqual(["KeyS"]);
    });

    it("labels the keys it ranks", () => {
      const stats = applySamples(
        {},
        [...many("KeyA", 300), ...many("KeyS", 800), ...many("KeyF", 200, 1)],
        0,
      );
      expect(
        Object.fromEntries(
          worstKeys(stats, 5).map((key) => [key.keycode, key.label]),
        ),
      ).toEqual({ KeyF: "error-prone", KeyS: "slow", KeyA: undefined });
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

      expect(summary.LP).toEqual({ total: 2, errors: 1, avgMs: 100 });
      expect(summary.RI.total).toEqual(1);
      expect(summary.RP.total).toEqual(0);
    });
  });

  describe("storage", () => {
    afterEach(() => {
      localStorage.removeItem("trainerKeyStats");
      vi.resetModules();
    });

    it("upgrades a stored v1 blob on load and writes it back", async () => {
      localStorage.setItem(
        "trainerKeyStats",
        JSON.stringify({
          version: 1,
          layouts: {
            qwerty: { KeyA: { ema: 2650, total: 2, errors: 1, lastSeen: 5 } },
          },
        }),
      );
      vi.resetModules();
      const fresh = await import("../../src/ts/trainer/key-stats");
      expect(fresh.getKeyStats().layouts["qwerty"]?.["KeyA"]).toMatchObject({
        emaMs: 150,
        errRate: 0.5,
      });
      expect(
        JSON.parse(localStorage.getItem("trainerKeyStats") ?? "{}").version,
      ).toBe(2);
    });
  });
});
