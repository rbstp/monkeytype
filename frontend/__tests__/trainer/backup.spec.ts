import { describe, expect, it } from "vitest";
import {
  exportBackup,
  importBackup,
  parseBackup,
} from "../../src/ts/trainer/backup";
import { getKeyStats, recordSamples } from "../../src/ts/trainer/key-stats";
import { progress, setCurrentLesson } from "../../src/ts/trainer/lessons";

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
    expect(progress().current).toBe(3);
  });

  it("rejects malformed input", () => {
    expect(parseBackup("not json")).toBeUndefined();
    expect(parseBackup('{"version":2}')).toBeUndefined();
    expect(importBackup("{}")).toBe(false);
  });
});
