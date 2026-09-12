import { LayoutObject } from "@monkeytype/schemas/layouts";
import {
  Keycode,
  leftSideKeys,
  qwertyKeycodeKeymap,
  rightSideKeys,
} from "../constants/keys";

/**
 * Converts a key to a keycode based on a layout
 * @param key Key to convert (e.g., "a")
 * @param layout Layout object from our JSON data (e.g., `layouts["qwerty"]`)
 * @returns Keycode location of the key (e.g., "KeyA")
 */
export function layoutKeyToKeycode(
  key: string,
  layout: LayoutObject,
): Keycode | undefined {
  return findLayoutKey(key, layout)?.keycode;
}

export const LAYOUT_ROWS: (keyof LayoutObject["keys"])[] = [
  "row1",
  "row2",
  "row3",
  "row4",
  "row5",
];

/**
 * Finds the keycode and legend layer (0 unshifted, 1 shifted, 2 altgr, 3 shift + altgr) of a key
 */
export function findLayoutKey(
  key: string,
  layout: LayoutObject,
): { keycode: Keycode; layer: number } | undefined {
  for (const [rowIndex, row] of LAYOUT_ROWS.entries()) {
    const keys = layout.keys[row];
    const keyIndex = keys.findIndex((legends) => legends.includes(key));
    if (keyIndex === -1) continue;
    const keycode = layoutPositionToKeycode(rowIndex, keyIndex, layout.type);
    if (keycode === undefined) return undefined;
    return { keycode, layer: keys[keyIndex]?.indexOf(key) ?? 0 };
  }
  return undefined;
}

/**
 * Converts a position in a layout's key rows to a keycode
 * @param rowIndex Index of the row (0 = row1)
 * @param keyIndex Index of the key within the row
 * @param type Layout type
 */
export function layoutPositionToKeycode(
  rowIndex: number,
  keyIndex: number,
  type: LayoutObject["type"],
): Keycode | undefined {
  if (type === "iso") {
    if (rowIndex === 2 && keyIndex === 11) return "Backslash";
    if (rowIndex === 3 && keyIndex === 0) return "IntlBackslash";
    if (rowIndex === 3) return qwertyKeycodeKeymap[3]?.[keyIndex - 1];
  }
  return qwertyKeycodeKeymap[rowIndex]?.[keyIndex];
}

/**
 * Inverse of layoutPositionToKeycode
 * @returns Row and key index, or undefined if the keycode has no position in this layout type
 */
function keycodeToLayoutPosition(
  keycode: Keycode,
  type: LayoutObject["type"],
): { rowIndex: number; keyIndex: number } | undefined {
  if (type === "iso") {
    if (keycode === "Backslash") return { rowIndex: 2, keyIndex: 11 };
    if (keycode === "IntlBackslash") return { rowIndex: 3, keyIndex: 0 };
  }
  for (const [rowIndex, row] of qwertyKeycodeKeymap.entries()) {
    const keyIndex = row.indexOf(keycode);
    if (keyIndex === -1) continue;
    const shift = type === "iso" && rowIndex === 3 ? 1 : 0;
    return { rowIndex, keyIndex: keyIndex + shift };
  }
  return undefined;
}

/**
 * Reads the legend of a keycode from a layout
 * @param layer 0 = unshifted, 1 = shifted, 2 = altgr, 3 = shift + altgr
 */
export function keycodeToLayoutKey(
  keycode: Keycode,
  layout: LayoutObject,
  layer = 0,
): string | undefined {
  const position = keycodeToLayoutPosition(keycode, layout.type);
  const row = LAYOUT_ROWS[position?.rowIndex ?? -1];
  if (position === undefined || row === undefined) return undefined;
  const legend = layout.keys[row][position.keyIndex]?.[layer];
  return legend === "" ? undefined : legend;
}

/**
 * Converts a keycode to a keyboard side. Can return true for both sides if the key is in the location KeyY, KeyB or Space.
 * @param keycode Keycode to convert (e.g., "KeyA")
 * @returns Object with leftSide and rightSide booleans
 */
export function keycodeToKeyboardSide(keycode: Keycode): {
  leftSide: boolean;
  rightSide: boolean;
} {
  const left = leftSideKeys.has(keycode);
  const right = rightSideKeys.has(keycode);

  return { leftSide: left, rightSide: right };
}

/**
 * Returns a copy of the given layout with the rows mirrored
 * @param layout Layout object from our JSON data (e.g., `layouts["qwerty"]`)
 * @returns layout Layout object from our JSON data (e.g., `layouts["qwerty"]`)
 */
export function mirrorLayoutKeys(layout: LayoutObject): LayoutObject {
  const reverse_index = [11, 10, 10, 10, 10];
  const mirror_keys: LayoutObject["keys"] = {
    row1: [
      ...[...layout.keys.row1.slice(0, reverse_index[0])].reverse(),
      ...layout.keys.row1.slice(reverse_index[0]),
    ],
    row2: [
      ...[...layout.keys.row2.slice(0, reverse_index[1])].reverse(),
      ...layout.keys.row2.slice(reverse_index[1]),
    ],
    row3: [
      ...[...layout.keys.row3.slice(0, reverse_index[2])].reverse(),
      ...layout.keys.row3.slice(reverse_index[2]),
    ],
    row4: [
      ...[...layout.keys.row4.slice(0, reverse_index[3])].reverse(),
      ...layout.keys.row4.slice(reverse_index[3]),
    ],
    row5: [
      ...[...layout.keys.row5.slice(0, reverse_index[4])].reverse(),
      ...layout.keys.row5.slice(reverse_index[4]),
    ],
  };
  const layoutCopy = { ...layout, keys: mirror_keys };
  return layoutCopy;
}
