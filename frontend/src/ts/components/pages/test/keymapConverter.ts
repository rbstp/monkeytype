import { KeymapStyle } from "@monkeytype/schemas/configs";
import { KeyLegends, LayoutObject } from "@monkeytype/schemas/layouts";
import { Keycode } from "../../../constants/keys";
import { Finger, HOME_KEYS, keycodeToFinger } from "../../../trainer/finger";
import {
  LAYOUT_ROWS,
  layoutPositionToKeycode,
} from "../../../utils/key-converter";

import {
  KeyboardDefinition,
  KeyDefinition,
  KeymapLayout,
  keymapLayouts,
} from "./keymapLayouts";

type ConvertOptions = {
  keymapStyle: KeymapStyle;
  showAllKeys: boolean;
};

export function convertLayoutToKeymap(
  layout: LayoutObject,
  options: ConvertOptions,
): KeyboardDefinition {
  const keymapLayout = keymapLayouts[options.keymapStyle]?.[layout.type];

  if (keymapLayout === undefined) {
    throw new Error(
      `not supported style ${options.keymapStyle} and layout type ${layout.type}`,
    );
  }

  return convert({
    legends: layout.keys,
    layoutType: layout.type,
    keymap: keymapLayout,
    convertOptions: options,
  });
}

function keycodeFor(
  keyDef: KeymapLayout[number][number],
  layoutType: LayoutObject["type"],
): Keycode | undefined {
  const position = keyDef.layoutPosition;
  if (position?.row === undefined) return undefined;
  return layoutPositionToKeycode(
    LAYOUT_ROWS.indexOf(position.row),
    position.col,
    layoutType,
  );
}

function fingerFor(
  keyDef: KeymapLayout[number][number],
  keycode: Keycode | undefined,
): Finger | undefined {
  if (keyDef.finger !== undefined) return keyDef.finger;
  if (keyDef.isLayoutIndicator) return "thumb";
  return keycode === undefined ? undefined : keycodeToFinger[keycode];
}

function convert(options: {
  legends: LayoutObject["keys"];
  layoutType: LayoutObject["type"];
  keymap: KeymapLayout;
  convertOptions: ConvertOptions;
}): KeyboardDefinition {
  const isShowAllKeys = options.convertOptions.showAllKeys ?? false;

  return options.keymap.map((keys) =>
    keys
      .map((keyDef) => {
        const layoutLegend =
          keyDef.layoutPosition?.row &&
          options.legends[keyDef.layoutPosition.row]?.[
            keyDef.layoutPosition.col
          ];

        const legends = keyDef.isLayoutIndicator
          ? buildLegends(" ")
          : buildLegends(keyDef.legend ?? layoutLegend);

        if (keyDef.isExtraKey && !isShowAllKeys) {
          return undefined;
        }

        const final = {
          ...keyDef,
          ...(isShowAllKeys ? keyDef.extraKeysOverride : {}),
        };
        const keycode = keycodeFor(keyDef, options.layoutType);
        const finger = fingerFor(keyDef, keycode);
        const isHomeKey = keycode !== undefined && HOME_KEYS.includes(keycode);

        return {
          legends,
          ...(final.height !== undefined ? { height: final.height } : {}),
          ...(final.width !== undefined ? { width: final.width } : {}),
          ...(final.x !== undefined ? { x: final.x } : {}),
          ...(final.y !== undefined ? { y: final.y } : {}),
          ...(final.rotation !== undefined ? { rotation: final.rotation } : {}),
          ...(final.isLayoutIndicator === true
            ? { isLayoutIndicator: true }
            : {}),
          ...(final.isHoming === true ? { isHoming: true } : {}),
          ...(finger !== undefined ? { finger } : {}),
          ...(isHomeKey ? { isHomeKey: true } : {}),
          ...(final.align !== undefined ? { align: final.align } : {}),
        } satisfies KeyDefinition;
      })
      //filter skipped keys
      .filter((it) => it !== undefined),
  );
}

const emptyLegends = ["", "", "", ""];
function buildLegends(legends: string | KeyLegends | undefined): KeyLegends {
  if (legends === undefined) return emptyLegends;
  if (typeof legends === "string") {
    return new Array<string>(4).fill(legends);
  }

  switch (legends.length) {
    case 1:
      return [legends[0] as string, legends[0] as string, "", ""];
    case 2:
      return [...legends, "", ""];
    case 3:
      return [...legends, ""];
    default:
      return legends;
  }
}
