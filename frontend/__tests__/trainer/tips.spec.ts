import { describe, expect, it } from "vitest";
import { Finger, FINGERS } from "../../src/ts/trainer/finger";
import { FingerSummary } from "../../src/ts/trainer/key-stats";
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

describe("tips", () => {
  it("asks for accuracy first when below target", () => {
    const tips = buildTips({
      acc: 92,
      consistency: 80,
      fingers: fingers(),
      weakKeys: [],
    });
    expect(tips[0]).toMatch(/Accuracy first/);
    expect(tips).toHaveLength(1);
  });

  it("mentions pauses when consistency is low", () => {
    const tips = buildTips({
      acc: 98,
      consistency: 40,
      fingers: fingers(),
      weakKeys: [],
    });
    expect(tips[0]).toMatch(/on target/);
    expect(tips[1]).toMatch(/pauses/);
  });

  it("names the weakest finger and its keys", () => {
    const tips = buildTips({
      acc: 98,
      consistency: 80,
      fingers: fingers({ RR: { total: 40, errors: 8, avgMs: 900 } }),
      weakKeys: [
        {
          keycode: "KeyL",
          finger: "RR",
          legend: "l",
          ema: 1800,
          total: 30,
          errors: 7,
          lastSeen: 0,
        },
        {
          keycode: "KeyK",
          finger: "RM",
          legend: "k",
          ema: 1400,
          total: 30,
          errors: 2,
          lastSeen: 0,
        },
      ],
    });
    expect(tips[1]).toMatch(/right ring at 80%\. Watch l\./);
  });

  it("ignores fingers with few samples", () => {
    const tips = buildTips({
      fingers: fingers({ LP: { total: 5, errors: 5, avgMs: 900 } }),
      weakKeys: [],
    });
    expect(tips).toEqual([]);
  });
});
