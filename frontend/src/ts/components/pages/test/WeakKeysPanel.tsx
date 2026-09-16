import { createMemo, For, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { Keycode } from "../../../constants/keys";
import { getLastResult, inputLayoutObject } from "../../../states/test";
import { getTheme } from "../../../states/theme";
import { FINGER_LABEL, FINGERS, fingerColors } from "../../../trainer/finger";
import {
  accuracy,
  fingerSummary,
  getLayoutStats,
  layoutStatsName,
  worstKeys,
} from "../../../trainer/key-stats";
import { buildTips } from "../../../trainer/tips";
import { keycodeToLayoutKey } from "../../../utils/key-converter";

const shownKeys = 8;

export function WeakKeysPanel() {
  const stats = createMemo(() =>
    getLayoutStats(layoutStatsName(getConfig.layout, getConfig.funbox)),
  );
  const keys = createMemo(() => worstKeys(stats(), shownKeys));
  const fingers = createMemo(() => fingerSummary(stats()));

  const legend = (keycode: Keycode): string => {
    const layout = inputLayoutObject();
    const label =
      layout === undefined ? undefined : keycodeToLayoutKey(keycode, layout);
    return label === " " ? "space" : (label ?? keycode);
  };

  const tips = createMemo(() => {
    const result = getLastResult();
    return buildTips({
      wpm: result?.wpm,
      acc: result?.acc,
      consistency: result?.consistency,
      ...(result?.afkDuration !== undefined && result.testDuration > 0
        ? { afkShare: result.afkDuration / result.testDuration }
        : {}),
      fingers: fingers(),
      weakKeys: keys().map((key) => ({ ...key, legend: legend(key.keycode) })),
    });
  });

  return (
    <Show when={keys().length > 0}>
      <div class="grid gap-8 text-sub sm:grid-cols-2">
        <div>
          <div class="pb-2 text-xs">weak keys</div>
          <div class="flex flex-wrap gap-2">
            <For each={keys()}>
              {(key) => (
                <div class="min-w-16 rounded bg-sub-alt px-3 py-2 text-center">
                  <div class="text-lg text-text">{legend(key.keycode)}</div>
                  <div class="text-xs">{Math.round(key.ema)} ms</div>
                  <div class="text-xs">{Math.round(accuracy(key))}%</div>
                </div>
              )}
            </For>
          </div>
        </div>
        <div>
          <div class="pb-2 text-xs">finger accuracy</div>
          <div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
            <For each={FINGERS}>
              {(finger) => (
                <Show when={fingers()[finger].total > 0}>
                  <div>{FINGER_LABEL[finger]}</div>
                  <div class="h-2 rounded bg-sub-alt">
                    <div
                      class="h-2 rounded"
                      style={{
                        width: `${accuracy(fingers()[finger])}%`,
                        "background-color": fingerColors(finger, getTheme()).bg,
                      }}
                    ></div>
                  </div>
                  <div>{Math.round(accuracy(fingers()[finger]))}%</div>
                </Show>
              )}
            </For>
          </div>
        </div>
        <ul class="list-disc pl-5 text-xs sm:col-span-2">
          <For each={tips()}>{(tip) => <li>{tip}</li>}</For>
        </ul>
      </div>
    </Show>
  );
}
