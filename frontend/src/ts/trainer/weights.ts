import { LayoutObject } from "@monkeytype/schemas/layouts";
import { Keycode } from "../constants/keys";
import { keycodeToLayoutKey } from "../utils/key-converter";
import { KeyStat, LayoutStats } from "./key-stats";

const minSamples = 5;
const errorFactor = 5;
const maxSlowFactor = 2;

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

// how far the key sits above the layout's typical speed, so an average key adds nothing
function slowFactor(stat: KeyStat, typical: number | undefined): number {
  if (typical === undefined || typical === 0 || stat.timed < minSamples) {
    return 0;
  }
  return Math.min(maxSlowFactor, Math.max(0, stat.emaMs / typical - 1));
}

// shifted legends share the key's weight, since the stat is per key
export function charWeights(
  stats: LayoutStats,
  layout: LayoutObject,
): Record<string, number> {
  const entries = Object.entries(stats) as [Keycode, KeyStat][];
  const typical = median(
    entries
      .filter(([, stat]) => stat.timed >= minSamples)
      .map(([, stat]) => stat.emaMs),
  );
  const weights: Record<string, number> = {};
  for (const [keycode, stat] of entries) {
    if (stat.total < minSamples) continue;
    const weight = 1 + stat.errRate * errorFactor + slowFactor(stat, typical);
    for (const layer of [0, 1]) {
      const legend = keycodeToLayoutKey(keycode, layout, layer);
      if (legend !== undefined && legend !== " ") weights[legend] = weight;
    }
  }
  return weights;
}
