import { describe, expect, it } from "vitest";
import {
  exportBackup,
  importBackup,
  parseBackup,
} from "../../src/ts/trainer/backup";
import {
  getLayoutConfusions,
  recordConfusions,
  resetConfusions,
} from "../../src/ts/trainer/confusions";
import {
  dayOf,
  getLayoutHistory,
  recordSnapshot,
  resetKeyHistory,
} from "../../src/ts/trainer/history";
import {
  getKeyStats,
  recordSamples,
  resetKeyStats,
} from "../../src/ts/trainer/key-stats";
import {
  getLayoutTransitions,
  recordTransitions,
  resetTransitions,
} from "../../src/ts/trainer/transitions";
import {
  currentLesson,
  progress,
  setCurrentLesson,
} from "../../src/ts/trainer/lessons";

describe("backup", () => {
  it("round trips key stats and progress", () => {
    recordSamples("qwerty", [
      { keycode: "KeyA", shifted: false, correct: true },
    ]);
    setCurrentLesson(3);
    resetConfusions();
    recordConfusions("qwerty", [
      { keycode: "KeyD", shifted: false, correct: false, typed: "KeyK" },
    ]);
    const json = exportBackup();

    recordSamples("qwerty", [
      { keycode: "KeyA", shifted: false, correct: false },
    ]);
    recordConfusions("qwerty", [
      { keycode: "KeyD", shifted: false, correct: false, typed: "KeyK" },
    ]);
    setCurrentLesson(0);
    expect(importBackup(json)).toBe(true);

    expect(getKeyStats().layouts["qwerty"]?.["KeyA"]?.total).toBe(1);
    expect(getLayoutConfusions("qwerty")).toEqual({ KeyD: { KeyK: 1 } });
    expect(currentLesson()).toBe(3);
    expect(JSON.parse(json)).toMatchObject({ version: 6 });
  });

  it("carries the key history and writes today's snapshot with the samples", () => {
    resetKeyHistory();
    resetKeyStats();
    recordSamples("qwerty", [
      { keycode: "KeyA", shifted: false, correct: true },
    ]);
    const today = dayOf(Date.now());
    expect(getLayoutHistory("qwerty")[today]?.["KeyA"]).toMatchObject({
      total: 1,
    });
    recordSnapshot("qwerty", { KeyS: { emaMs: 1, errRate: 0, total: 9 } }, 0);
    const json = exportBackup();
    resetKeyHistory();
    expect(importBackup(json)).toBe(true);
    expect(getLayoutHistory("qwerty")["1970-01-01"]).toEqual({
      KeyS: { emaMs: 1, errRate: 0, total: 9 },
    });
  });

  it("applies every cap to the blob it imports", () => {
    const row: Record<string, number> = {};
    for (let i = 0; i < 12; i++) row[`Key${i}`] = 100 - i;
    const pairs: Record<string, { emaMs: number; count: number }> = {};
    for (let i = 0; i < 15; i++) {
      pairs[`Key${i}`] = { emaMs: 200, count: 100 - i };
    }
    const json = JSON.stringify({
      version: 6,
      keyStats: { version: 2, layouts: {} },
      progress: {
        version: 3,
        layouts: {
          qwerty: { current: "home-row", unlocked: "home-row", best: {} },
        },
        attempts: Array.from({ length: 60 }, (_, ts) => ({
          lesson: "home-row",
          layout: "qwerty",
          wpm: 20,
          acc: 90,
          perKey: {},
          ts,
        })),
      },
      confusions: { version: 1, layouts: { qwerty: { KeyD: row } } },
      transitions: { version: 1, layouts: { qwerty: { KeyD: pairs } } },
      keyHistory: { version: 1, layouts: {} },
    });

    expect(importBackup(json)).toBe(true);
    expect(progress().attempts).toHaveLength(50);
    expect(
      Object.keys(getLayoutConfusions("qwerty")["KeyD"] ?? {}),
    ).toHaveLength(8);
    expect(
      Object.keys(getLayoutTransitions("qwerty")["KeyD"] ?? {}),
    ).toHaveLength(12);
  });

  it("imports every earlier version and reads back as version 5", () => {
    const progressV3 = { version: 3, layouts: {}, attempts: [] };
    const versions = [
      {
        version: 1,
        keyStats: { version: 1, layouts: {} },
        progress: { version: 1, current: 0, unlocked: 0, attempts: [] },
      },
      {
        version: 2,
        keyStats: { version: 2, layouts: {} },
        progress: { version: 2, layouts: {}, attempts: [] },
      },
      {
        version: 3,
        keyStats: { version: 2, layouts: {} },
        progress: progressV3,
      },
      {
        version: 4,
        keyStats: { version: 2, layouts: {} },
        progress: progressV3,
        confusions: { version: 1, layouts: { qwerty: { KeyD: { KeyK: 4 } } } },
      },
      {
        version: 5,
        keyStats: { version: 2, layouts: {} },
        progress: progressV3,
        confusions: { version: 1, layouts: { qwerty: { KeyD: { KeyK: 4 } } } },
        keyHistory: { version: 1, layouts: {} },
      },
    ];
    for (const backup of versions) {
      expect(parseBackup(JSON.stringify(backup))).toMatchObject({ version: 6 });
      expect(importBackup(JSON.stringify(backup))).toBe(true);
      expect(getLayoutHistory("qwerty")).toEqual({});
      expect(getLayoutTransitions("qwerty")).toEqual({});
      expect(JSON.parse(exportBackup())).toMatchObject({
        version: 6,
        keyHistory: { version: 1 },
      });
    }
    expect(getLayoutConfusions("qwerty")).toEqual({ KeyD: { KeyK: 4 } });
  });

  it("starts confusions empty when an older backup lacks them", () => {
    recordConfusions("qwerty", [
      { keycode: "KeyD", shifted: false, correct: false, typed: "KeyK" },
    ]);
    const json = JSON.stringify({
      version: 3,
      keyStats: { version: 2, layouts: {} },
      progress: { version: 3, layouts: {}, attempts: [] },
    });
    expect(importBackup(json)).toBe(true);
    expect(getLayoutConfusions("qwerty")).toEqual({});
    expect(exportBackup()).toContain('"version":6');
  });

  it("upgrades a version 1 backup on import", () => {
    const json = JSON.stringify({
      version: 1,
      keyStats: { version: 2, layouts: {} },
      progress: {
        version: 1,
        current: 1,
        unlocked: 2,
        attempts: [
          { lesson: 0, wpm: 40, acc: 99, perKey: {}, ts: 1 },
          { lesson: 99, wpm: 40, acc: 99, perKey: {}, ts: 2 },
        ],
      },
    });
    expect(parseBackup(json)).toMatchObject({ version: 6 });
    expect(importBackup(json)).toBe(true);
    expect(progress()).toEqual({
      version: 3,
      layouts: {
        qwerty: { current: "e-i", unlocked: "r-u", best: { "home-row": 40 } },
      },
      attempts: [
        {
          lesson: "home-row",
          layout: "qwerty",
          wpm: 40,
          acc: 99,
          perKey: {},
          ts: 1,
        },
      ],
    });
    expect(exportBackup()).toContain('"version":6');
  });

  it("upgrades a version 2 backup on import and keeps the unlocked lesson", () => {
    const json = JSON.stringify({
      version: 2,
      keyStats: { version: 2, layouts: {} },
      progress: {
        version: 2,
        layouts: {
          qwerty: { current: 12, unlocked: 13, best: { capitals: 39 } },
        },
        attempts: [
          {
            lesson: "capitals",
            layout: "qwerty",
            wpm: 39,
            acc: 99,
            perKey: {},
            ts: 1,
          },
        ],
      },
    });
    expect(importBackup(json)).toBe(true);
    expect(progress()).toEqual({
      version: 3,
      layouts: {
        qwerty: {
          current: "capitals-left",
          unlocked: "quote-minus",
          best: { "capitals-left": 39 },
        },
      },
      attempts: [
        {
          lesson: "capitals-left",
          layout: "qwerty",
          wpm: 39,
          acc: 99,
          perKey: {},
          ts: 1,
        },
      ],
    });
    expect(currentLesson()).toBe(12);
  });

  it("upgrades v1 key stats on import", () => {
    const json = JSON.stringify({
      version: 1,
      keyStats: {
        version: 1,
        layouts: {
          qwerty: { KeyA: { ema: 2650, total: 2, errors: 1, lastSeen: 5 } },
        },
      },
      progress: { version: 1, current: 0, unlocked: 0, attempts: [] },
    });
    expect(importBackup(json)).toBe(true);
    expect(getKeyStats().version).toBe(2);
    expect(getKeyStats().layouts["qwerty"]?.["KeyA"]).toMatchObject({
      emaMs: 150,
      errRate: 0.5,
      total: 2,
    });
  });

  it("rejects malformed input", () => {
    expect(parseBackup("not json")).toBeUndefined();
    expect(parseBackup('{"version":2}')).toBeUndefined();
    expect(importBackup("{}")).toBe(false);
  });

  it("round trips the transitions and starts them empty without them", () => {
    resetTransitions();
    recordTransitions("qwerty", [
      {
        keycode: "KeyE",
        shifted: false,
        correct: true,
        prev: "KeyD",
        spacingMs: 300,
      },
    ]);
    const json = exportBackup();
    resetTransitions();
    expect(importBackup(json)).toBe(true);
    expect(getLayoutTransitions("qwerty")).toEqual({
      KeyD: { KeyE: { emaMs: 300, count: 1 } },
    });

    const older = JSON.stringify({
      version: 5,
      keyStats: { version: 2, layouts: {} },
      progress: { version: 3, layouts: {}, attempts: [] },
    });
    expect(importBackup(older)).toBe(true);
    expect(getLayoutTransitions("qwerty")).toEqual({});
  });
});
