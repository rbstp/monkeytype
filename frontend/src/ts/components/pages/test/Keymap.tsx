import { LayoutObject } from "@monkeytype/schemas/layouts";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { Keycode } from "../../../constants/keys";
import { showCommandLineForConfig } from "../../../states/core";
import { getModifierState, isCapsLockOn } from "../../../states/modifiers";
import {
  FlashEntry,
  getKeymapFlashState,
  getKeymapHighlightKey,
  getKeymapLayout,
  keymapLayoutObject,
  setKeymapFlashState,
  wordsHaveNumbers,
} from "../../../states/test";
import { getTheme } from "../../../states/theme";
import {
  charToFinger,
  FINGER_LABEL,
  fingerColors,
  HOME_KEYS,
  shiftFingerFor,
} from "../../../trainer/finger";
import { heatColors } from "../../../trainer/heat";
import { getLayoutStats, layoutStatsName } from "../../../trainer/key-stats";
import { tracksNextKey } from "../../../trainer/session";
import { cn } from "../../../utils/cn";
import { keycodeToLayoutKey } from "../../../utils/key-converter";
import { resolveLayoutName } from "../../../utils/layout-name";
import { isMacLike } from "../../../utils/misc";
import { Anime } from "../../common/anime";
import { Button } from "../../common/Button";
import { convertLayoutToKeymap } from "./keymapConverter";
import { KeyboardDefinition, KeyDefinition } from "./keymapLayouts";

const symbolsPattern = /^[^\p{L}\p{N}]{1}$/u;

const isSteno = (): boolean =>
  getConfig.keymapStyle === "steno" || getConfig.keymapStyle === "steno_matrix";

export function Keymap() {
  return (
    <Show when={getConfig.keymapMode !== "off" && keymapLayoutObject()}>
      <Keyboard
        displayName={getKeymapLayout().layoutNameDisplayString}
        layoutData={keymapLayoutObject() as LayoutObject}
      />
    </Show>
  );
}

function Keyboard(props: { displayName: string; layoutData: LayoutObject }) {
  const layer = createMemo(() => {
    const { alt, shift } = getModifierState();

    // MacOS has different CapsLock and Shift logic than other operating systems
    // Windows and Linux only capitalize letters if either Shift OR CapsLock are
    // pressed, but not both at once.
    // MacOS instead capitalizes when either or both are pressed,
    // so we have to check for that.
    const isShifted = isMacLike()
      ? shift || isCapsLockOn()
      : shift !== isCapsLockOn();

    switch (getConfig.keymapLegendStyle) {
      case "blank":
        return { index: -1 };
      case "lowercase":
        return { index: 0 };
      case "uppercase":
        return { index: 1, symbolIndex: 0 };
      case "dynamic": {
        if (shift && alt) {
          return { index: 3 };
        } else if (alt) {
          return { index: 2 };
        }
        return { index: isShifted ? 1 : 0, symbolIndex: shift ? 1 : 0 };
      }
      default:
        return { index: 0 };
    }
  });

  const showFirstRow = createMemo(
    () =>
      (wordsHaveNumbers() && getConfig.keymapMode === "next") ||
      getConfig.keymapKeys === "full" ||
      getConfig.keymapKeys === "minimal_numrow" ||
      (getConfig.keymapKeys === "minimal" && props.layoutData.keymapShowTopRow),
  );

  const keyboardDef = createMemo(() =>
    convertLayoutToKeymap(props.layoutData, {
      keymapStyle: getConfig.keymapStyle,
      showAllKeys:
        getConfig.keymapKeys === "full" ||
        props.layoutData.matrixShowRightColumn === true,
    }),
  );

  const nextFingerLabel = createMemo(() => {
    if (
      !tracksNextKey() ||
      getConfig.keymapFingerColors === "off" ||
      isSteno()
    ) {
      return undefined;
    }
    const next = getKeymapHighlightKey();
    if (next === undefined) return undefined;
    const finger = charToFinger(next, props.layoutData);
    if (finger === undefined) return undefined;
    const shift = shiftFingerFor(next, props.layoutData);
    return shift === undefined
      ? FINGER_LABEL[finger]
      : `${FINGER_LABEL[finger]} + ${FINGER_LABEL[shift]} shift`;
  });

  const heat = createMemo(() =>
    heatColors(
      getLayoutStats(
        layoutStatsName(
          resolveLayoutName(getConfig.layout, getConfig.keymapLayout),
          getConfig.funbox,
        ),
      ),
      isSteno() ? "off" : getConfig.keymapHeat,
      getTheme(),
    ),
  );

  const restLabel = createMemo(() => {
    if (getConfig.keymapFingerColors === "off" || isSteno()) return undefined;
    const legends = HOME_KEYS.map(
      (keycode) => keycodeToLayoutKey(keycode, props.layoutData) ?? "?",
    );
    return `rest: ${legends.slice(0, 4).join(" ")}   ${legends.slice(4).join(" ")}   thumbs on space`;
  });

  return (
    <div
      data-ui-element="keymap"
      class="flex w-full flex-col items-center py-8 text-sm text-sub"
    >
      <Show when={keyboardDef()} fallback={<div>Loading...</div>}>
        <KeyboardDefinitionRenderer
          keyboardDef={keyboardDef()}
          layer={layer()}
          showFirstRow={showFirstRow()}
          flashState={getKeymapFlashState}
          heat={heat()}
        />
      </Show>
      <Show when={restLabel()}>
        <div class="pt-2 text-xs whitespace-pre text-sub">{restLabel()}</div>
      </Show>
      <Show when={nextFingerLabel()}>
        <div class="pt-1 text-xs text-sub">{nextFingerLabel()}</div>
      </Show>
    </div>
  );
}

function KeyboardDefinitionRenderer(props: {
  keyboardDef: KeyboardDefinition;
  layer: { index: number; symbolIndex?: number };
  showFirstRow: boolean;
  flashState: Record<string, FlashEntry | undefined>;
  heat: Partial<Record<Keycode, string>>;
}) {
  return (
    <div
      class="w-fit xxs:zoom-(--kb-zoom-xxs) xs:zoom-(--kb-zoom-xs) sm:zoom-(--kb-zoom-sm) md:zoom-(--kb-zoom-md) lg:zoom-(--kb-zoom-lg) xl:zoom-(--kb-zoom-xl) 2xl:zoom-(--kb-zoom-2xl)"
      style={{
        "--kb-zoom-xxs": Math.min(getConfig.keymapSize, 0.5),
        "--kb-zoom-xs": Math.min(getConfig.keymapSize, 0.7),
        "--kb-zoom-sm": Math.min(getConfig.keymapSize, 1),
        "--kb-zoom-md": Math.min(getConfig.keymapSize, 1.3),
        "--kb-zoom-lg": Math.min(getConfig.keymapSize, 1.7),
        "--kb-zoom-xl": Math.min(getConfig.keymapSize, 2.2),
        "--kb-zoom-2xl": Math.min(getConfig.keymapSize, 2.9),
      }}
    >
      <For each={props.keyboardDef}>
        {(keys, rowNum) => (
          <Show when={rowNum() !== 0 || props.showFirstRow}>
            <div class="flex h-8 flex-row">
              <For each={keys}>
                {(key) => {
                  const label = () => {
                    let label = key.legends[props.layer.index];

                    if (props.layer.symbolIndex !== undefined) {
                      const keyIsSymbol = [
                        key.legends[props.layer.index],
                        key.legends[props.layer.symbolIndex],
                      ].some((character) =>
                        symbolsPattern.test(character ?? ""),
                      );

                      if (keyIsSymbol) {
                        label = key.legends[props.layer.symbolIndex];
                      }
                    }
                    return label ?? "";
                  };
                  const flashEntry = () =>
                    key.legends
                      .map((legend) => props.flashState[legend])
                      .find((it) => it !== undefined);
                  const heat = (): string | undefined =>
                    key.keycode === undefined
                      ? undefined
                      : props.heat[key.keycode];
                  return (
                    <Key
                      {...key}
                      label={label()}
                      flashEntry={flashEntry}
                      heat={heat()}
                    />
                  );
                }}
              </For>
            </div>
          </Show>
        )}
      </For>
    </div>
  );
}

function Key(
  props: {
    label: string;
    flashEntry: () => FlashEntry | undefined;
    /** ring colour from the trainer heatmap, the fill stays with the finger */
    heat?: string;
  } & KeyDefinition,
) {
  // Steno keys never flash.
  const flashInfo = createMemo(() => {
    if (isSteno() || getConfig.keymapMode !== "react") {
      return { tick: 0, correct: true };
    }

    const entry = props.flashEntry();
    return { tick: entry?.tick ?? 0, correct: entry?.correct ?? true };
  });

  const isNext = createMemo(
    () =>
      getConfig.keymapMode === "next" &&
      !isSteno() &&
      props.legends?.some((legend) => legend === getKeymapHighlightKey()),
  );

  const keyMatchesHighlight = createMemo(() =>
    props.legends?.some((legend) => legend === getKeymapHighlightKey()),
  );

  // Fade when leaving "next" mode
  const [isFading, setIsFading] = createSignal(false);
  let prevKeymapMode = getConfig.keymapMode;
  let prevKeyWasHighlighted = false;
  createEffect(() => {
    const mode = getConfig.keymapMode;
    const isStenoMode = isSteno();
    const keyWasHighlighted = keyMatchesHighlight() && !isStenoMode;

    if (prevKeymapMode === "next" && mode !== "next" && prevKeyWasHighlighted) {
      setIsFading(true);
    }
    prevKeymapMode = mode;
    prevKeyWasHighlighted = keyWasHighlighted;
  });

  const idleColors = createMemo(() => {
    const theme = getTheme();
    if (
      getConfig.keymapFingerColors !== "off" &&
      !isSteno() &&
      props.finger !== undefined
    ) {
      return fingerColors(props.finger, theme);
    }
    return { bg: theme.subAlt, text: theme.sub };
  });

  const restBgColor = () => (isNext() ? getTheme().main : idleColors().bg);
  const restTextColor = () => (isNext() ? getTheme().bg : idleColors().text);

  const baseKeyBgColor = () => {
    if (isFading()) {
      return getTheme().main;
    }
    return restBgColor();
  };

  const baseKeyColor = () => {
    if (isFading()) {
      return getTheme().bg;
    }
    return restTextColor();
  };

  const animKeyBgColor = createMemo(() => {
    if (isFading()) {
      return [getTheme().main, idleColors().bg];
    }
    if (flashInfo().tick === 0) {
      return [restBgColor()];
    }
    return [
      flashInfo().correct ? getTheme().main : getTheme().error,
      restBgColor(),
    ];
  });

  const animKeyColor = createMemo(() => {
    if (isFading()) {
      return [getTheme().bg, idleColors().text];
    }
    if (flashInfo().tick === 0) {
      return [restTextColor()];
    }
    return [getTheme().bg, restTextColor()];
  });

  // Don't apply reduced motion. If the user activates react/next they want animations.
  const animDuration = createMemo(() => {
    if (isFading()) return 250;
    if (flashInfo().tick === 0) return 0;
    return 250;
  });

  return (
    <Anime
      class={cn(
        "relative flex justify-center rounded border-2 border-bg bg-sub-alt",
        (props.label ?? "").length >= 2 && "text-em-xs",
        {
          "items-center": props.align !== "top",
          "items-start pt-1.5": props.align === "top",
        },
      )}
      style={{
        "--keybgcolor": baseKeyBgColor(),
        "--keycolor": baseKeyColor(),
        height: `${(props.height ?? 1) * 2}rem`,
        width: `${(props.width ?? 1) * 2}rem`,
        "margin-left": `${(props.x ?? 0) * 2}rem`,
        "margin-top": `${(props.y ?? 0) * 2}rem`,
        ...(props.heat === undefined ? {} : { "border-color": props.heat }),
        transform:
          props.rotation !== undefined ? `rotate(${props.rotation}deg)` : "",
        "background-color": "var(--keybgcolor)",
        color: "var(--keycolor)",
      }}
      // Don't apply reduced motion. If the user activates react/next they want animations.
      respectReducedMotion={false}
      animation={{
        "--keybgcolor": animKeyBgColor(),
        "--keycolor": animKeyColor(),
        duration: animDuration(),
        onComplete: () => {
          props.legends.forEach((l) => setKeymapFlashState(l, undefined));
          if (isFading()) {
            setIsFading(false);
          }
        },
      }}
    >
      <Show
        when={props.isLayoutIndicator}
        fallback={
          <>
            {props.label}
            <Show when={props.isHoming}>
              <div
                class={cn(
                  "bg-em-xs absolute bottom-0.75 left-auto h-0.5 w-2 rounded bg-bg",
                )}
              ></div>
            </Show>
            <Show
              when={
                props.isHomeKey &&
                !props.isHoming &&
                getConfig.keymapFingerColors !== "off"
              }
            >
              <div class="absolute bottom-0.75 left-auto h-0.5 w-0.5 rounded bg-bg"></div>
            </Show>
          </>
        }
      >
        <Button
          variant="text"
          class="text-[0.5em] [--themable-button-bg:transparent] [--themable-button-text:var(--keycolor)]"
          text={getKeymapLayout().layoutNameDisplayString}
          onClick={() => showCommandLineForConfig("keymapLayout")}
          tabIndex={-1}
        />
      </Show>
    </Anime>
  );
}
