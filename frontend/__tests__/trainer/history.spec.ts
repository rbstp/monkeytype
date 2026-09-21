import { describe, expect, it } from "vitest";
import {
  dayOf,
  getLayoutHistory,
  keyDeltas,
  LayoutHistory,
  recordSnapshot,
  resetKeyHistory,
  SnapshotStat,
  withSnapshot,
} from "../../src/ts/trainer/history";

const stat = (emaMs: number, total: number, errRate = 0): SnapshotStat => ({
  emaMs,
  errRate,
  total,
});

describe("history", () => {
  describe("dayOf", () => {
    it("formats a local date as YYYY-MM-DD", () => {
      expect(dayOf(new Date(2026, 8, 21, 13).getTime())).toBe("2026-09-21");
      expect(dayOf(new Date(2026, 0, 5).getTime())).toBe("2026-01-05");
    });
  });

  describe("withSnapshot", () => {
    it("writes the day, replaces the same day and keeps 90 days", () => {
      let history: LayoutHistory = {};
      history = withSnapshot(history, { KeyA: stat(300, 10) }, "2026-06-01");
      history = withSnapshot(history, { KeyA: stat(280, 30) }, "2026-06-01");
      history = withSnapshot(history, { KeyA: stat(250, 60) }, "2026-06-20");
      expect(history).toEqual({
        "2026-06-01": { KeyA: stat(280, 30) },
        "2026-06-20": { KeyA: stat(250, 60) },
      });
      history = withSnapshot(history, { KeyA: stat(200, 90) }, "2026-08-31");
      expect(Object.keys(history)).toEqual(["2026-06-20", "2026-08-31"]);
      history = withSnapshot(history, { KeyA: stat(190, 99) }, "2026-09-19");
      expect(Object.keys(history)).toEqual(["2026-08-31", "2026-09-19"]);
    });

    it("keeps only emaMs, errRate and total", () => {
      const history = withSnapshot(
        {},
        {
          KeyA: {
            emaMs: 300,
            errRate: 0.1,
            total: 12,
            timed: 9,
            errors: 1,
            lastSeen: 5,
          } as SnapshotStat,
        },
        "2026-09-21",
      );
      expect(history["2026-09-21"]).toEqual({
        KeyA: { emaMs: 300, errRate: 0.1, total: 12 },
      });
    });
  });

  describe("keyDeltas", () => {
    const today = "2026-09-21";
    const history: LayoutHistory = {
      "2026-09-01": { KeyA: stat(400, 10), KeyS: stat(300, 10) },
      "2026-09-13": {
        KeyA: stat(300, 40),
        KeyS: stat(300, 40),
        KeyD: stat(200, 40),
        KeyF: stat(200, 40),
        KeyG: stat(0, 40),
      },
      "2026-09-18": { KeyA: stat(100, 100) },
    };

    it("compares with the newest snapshot at least a week old", () => {
      const deltas = keyDeltas(
        history,
        {
          KeyA: stat(240, 60),
          KeyS: stat(320, 80),
          KeyD: stat(260, 60),
          KeyF: stat(150, 60),
          KeyG: stat(300, 80),
          KeyH: stat(900, 80),
        },
        today,
      );
      expect(deltas).toEqual([
        { keycode: "KeyA", ms: -60, since: "2026-09-13" },
        { keycode: "KeyD", ms: 60, since: "2026-09-13" },
        { keycode: "KeyF", ms: -50, since: "2026-09-13" },
      ]);
    });

    it("needs 20 new samples and 15% movement", () => {
      expect(
        keyDeltas(history, { KeyA: stat(100, 59), KeyS: stat(340, 80) }, today),
      ).toEqual([]);
      expect(keyDeltas(history, { KeyA: stat(255, 60) }, today)).toEqual([
        { keycode: "KeyA", ms: -45, since: "2026-09-13" },
      ]);
    });

    it("stays silent without a snapshot old enough", () => {
      expect(keyDeltas({}, { KeyA: stat(100, 100) }, today)).toEqual([]);
      expect(
        keyDeltas(
          { "2026-09-15": { KeyA: stat(300, 10) } },
          { KeyA: stat(100, 100) },
          today,
        ),
      ).toEqual([]);
      expect(
        keyDeltas(
          { "2026-09-14": { KeyA: stat(300, 10) } },
          { KeyA: stat(100, 100) },
          today,
        ),
      ).toEqual([{ keycode: "KeyA", ms: -200, since: "2026-09-14" }]);
    });
  });

  describe("store", () => {
    it("records per layout and day, then resets", () => {
      resetKeyHistory();
      const noon = new Date(2026, 8, 21, 12).getTime();
      recordSnapshot("qwerty", { KeyA: stat(300, 10) }, noon);
      recordSnapshot("qwerty", { KeyA: stat(290, 12) }, noon + 60_000);
      recordSnapshot("dvorak", { KeyA: stat(500, 5) }, noon);
      expect(getLayoutHistory("qwerty")).toEqual({
        "2026-09-21": { KeyA: stat(290, 12) },
      });
      expect(getLayoutHistory("dvorak")).toEqual({
        "2026-09-21": { KeyA: stat(500, 5) },
      });
      resetKeyHistory();
      expect(getLayoutHistory("qwerty")).toEqual({});
    });
  });
});
