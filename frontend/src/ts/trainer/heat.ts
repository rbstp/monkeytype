import { KeymapHeat } from "@monkeytype/schemas/configs";
import { Keycode } from "../constants/keys";
import { Theme } from "../constants/themes";
import { blendTwoHexColors } from "../utils/colors";
import { KeyStat, LayoutStats } from "./key-stats";

const minSamples = 5;
const maxErrRate = 0.15;
const lowPercentile = 0.2;
const highPercentile = 0.8;

export type HeatTheme = Pick<Theme, "sub" | "error">;

function percentile(sorted: number[], share: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * share)),
  );
  return sorted[index] as number;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// percentiles rather than the raw range, so one outlier key cannot flatten the rest
export function heatColors(
  stats: LayoutStats,
  mode: KeymapHeat,
  theme: HeatTheme,
): Partial<Record<Keycode, string>> {
  const colors: Partial<Record<Keycode, string>> = {};
  if (mode === "off") return colors;
  const entries = (Object.entries(stats) as [Keycode, KeyStat][]).filter(
    ([, stat]) =>
      mode === "speed" ? stat.timed >= minSamples : stat.total >= minSamples,
  );
  const speeds = entries.map(([, stat]) => stat.emaMs).sort((a, b) => a - b);
  const low = percentile(speeds, lowPercentile);
  const high = percentile(speeds, highPercentile);
  for (const [keycode, stat] of entries) {
    const share =
      mode === "speed"
        ? high === low
          ? 0
          : (stat.emaMs - low) / (high - low)
        : stat.errRate / maxErrRate;
    colors[keycode] = blendTwoHexColors(theme.sub, theme.error, clamp(share));
  }
  return colors;
}
