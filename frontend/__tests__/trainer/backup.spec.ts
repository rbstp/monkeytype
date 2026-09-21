import { describe, expect, it } from "vitest";
import {
  exportBackup,
  importBackup,
  parseBackup,
} from "../../src/ts/trainer/backup";
import { getKeyStats, recordSamples } from "../../src/ts/trainer/key-stats";
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
    const json = exportBackup();

    recordSamples("qwerty", [
      { keycode: "KeyA", shifted: false, correct: false },
    ]);
    setCurrentLesson(0);
    expect(importBackup(json)).toBe(true);

    expect(getKeyStats().layouts["qwerty"]?.["KeyA"]?.total).toBe(1);
    expect(currentLesson()).toBe(3);
    expect(JSON.parse(json)).toMatchObject({ version: 3 });
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
    expect(parseBackup(json)).toMatchObject({ version: 3 });
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
    expect(exportBackup()).toContain('"version":3');
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
});
