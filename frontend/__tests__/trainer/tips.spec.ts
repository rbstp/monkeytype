import { describe, expect, it } from "vitest";
import { Finger, FINGERS } from "../../src/ts/trainer/finger";
import { FingerSummary, RankedKey } from "../../src/ts/trainer/key-stats";
import { buildTips } from "../../src/ts/trainer/tips";

function fingers(
  overrides: Partial<Record<Finger, FingerSummary>> = {},
): Record<Finger, FingerSummary> {
  return Object.fromEntries(
    FINGERS.map((finger) => [
      finger,
      overrides[finger] ?? { total: 50, errors: 0, avgMs: 200 },
    ]),
  ) as Record<Finger, FingerSummary>;
}

const key = (
  overrides: Partial<RankedKey & { legend: string }>,
): RankedKey & { legend: string } => ({
  keycode: "KeyL",
  finger: "RR",
  legend: "l",
  ema: 1800,
  total: 30,
  errors: 7,
  lastSeen: 0,
  ...overrides,
});

describe("tips", () => {
  it("asks for accuracy first when below target", () => {
    const tips = buildTips({
      wpm: 40,
      acc: 92,
      consistency: 80,
      fingers: fingers(),
      weakKeys: [],
    });
    expect(tips[0]).toMatch(/Accuracy 92%: slow down until you hold 97%/);
    expect(tips).toHaveLength(1);
  });

  it("does not ask a hunting typist to slow down further", () => {
    const tips = buildTips({
      wpm: 10,
      acc: 90,
      consistency: 80,
      fingers: fingers(),
      weakKeys: [],
    });
    expect(tips[0]).toMatch(/wrong-finger reaches, not speed/);
    expect(tips[0]).toMatch(/90% at 10 wpm/);
  });

  it("calls out idle time before consistency", () => {
    const tips = buildTips({
      wpm: 30,
      acc: 98,
      consistency: 40,
      afkShare: 0.2262,
      fingers: fingers(),
      weakKeys: [],
    });
    expect(tips[0]).toMatch(/on target/);
    expect(tips[1]).toMatch(/23% of this test was idle/);
  });

  it("falls back to consistency when the test was not idle", () => {
    const tips = buildTips({
      acc: 98,
      consistency: 40,
      afkShare: 0.01,
      fingers: fingers(),
      weakKeys: [],
    });
    expect(tips[1]).toMatch(/Consistency 40%/);
  });

  it("names the slowest keys and the weakest finger", () => {
    const tips = buildTips({
      acc: 98,
      consistency: 80,
      fingers: fingers({ RR: { total: 40, errors: 8, avgMs: 900 } }),
      weakKeys: [
        key({}),
        key({ keycode: "KeyK", finger: "RM", legend: "k", ema: 1400 }),
        key({ keycode: "KeyA", finger: "LP", legend: "a", ema: 120 }),
      ],
    });
    expect(tips[1]).toBe(
      "Slowest keys: l 1.8s, k 1.4s, weakest finger: right ring at 80%. Say each letter as you press it for a few tests.",
    );
  });

  it("keeps quiet when there is nothing to say", () => {
    const tips = buildTips({
      fingers: fingers({ LP: { total: 5, errors: 5, avgMs: 900 } }),
      weakKeys: [key({ ema: 200 })],
    });
    expect(tips).toEqual([]);
  });
});
