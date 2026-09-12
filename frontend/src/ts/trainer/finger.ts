import { LayoutObject } from "@monkeytype/schemas/layouts";
import { Keycode } from "../constants/keys";
import { Theme } from "../constants/themes";
import { blendTwoHexColors, isColorLight } from "../utils/colors";
import { findLayoutKey } from "../utils/key-converter";

export type Finger =
  | "LP"
  | "LR"
  | "LM"
  | "LI"
  | "RI"
  | "RM"
  | "RR"
  | "RP"
  | "thumb";

export const FINGERS: Finger[] = [
  "LP",
  "LR",
  "LM",
  "LI",
  "thumb",
  "RI",
  "RM",
  "RR",
  "RP",
];

export const HOME_KEYS: Keycode[] = [
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyJ",
  "KeyK",
  "KeyL",
  "Semicolon",
];

export const FINGER_LABEL: Record<Finger, string> = {
  LP: "left pinky",
  LR: "left ring",
  LM: "left middle",
  LI: "left index",
  RI: "right index",
  RM: "right middle",
  RR: "right ring",
  RP: "right pinky",
  thumb: "thumb",
};

const fingerKeys: Record<Finger, Keycode[]> = {
  LP: [
    "Backquote",
    "Digit1",
    "KeyQ",
    "KeyA",
    "KeyZ",
    "IntlBackslash",
    "ShiftLeft",
  ],
  LR: ["Digit2", "KeyW", "KeyS", "KeyX"],
  LM: ["Digit3", "KeyE", "KeyD", "KeyC"],
  LI: ["Digit4", "Digit5", "KeyR", "KeyT", "KeyF", "KeyG", "KeyV", "KeyB"],
  RI: ["Digit6", "Digit7", "KeyY", "KeyU", "KeyH", "KeyJ", "KeyN", "KeyM"],
  RM: ["Digit8", "KeyI", "KeyK", "Comma"],
  RR: ["Digit9", "KeyO", "KeyL", "Period"],
  RP: [
    "Digit0",
    "Minus",
    "Equal",
    "KeyP",
    "BracketLeft",
    "BracketRight",
    "Backslash",
    "Semicolon",
    "Quote",
    "Slash",
    "ShiftRight",
  ],
  thumb: ["Space"],
};

export const keycodeToFinger: Partial<Record<Keycode, Finger>> =
  Object.fromEntries(
    (Object.entries(fingerKeys) as [Finger, Keycode[]][]).flatMap(
      ([finger, keys]) => keys.map((key) => [key, finger]),
    ),
  );

function isLeftHand(finger: Finger): boolean {
  return finger.startsWith("L");
}

export function charToFinger(
  char: string,
  layout: LayoutObject,
): Finger | undefined {
  if (char === " ") return "thumb";
  const found = findLayoutKey(char, layout);
  return found === undefined ? undefined : keycodeToFinger[found.keycode];
}

export function isShiftedLayer(layer: number): boolean {
  return layer === 1 || layer === 3;
}

/**
 * Returns the shift finger for a shifted legend, on the hand opposite to the key
 */
export function shiftFingerFor(
  char: string,
  layout: LayoutObject,
): Finger | undefined {
  const found = findLayoutKey(char, layout);
  const finger =
    found === undefined ? undefined : keycodeToFinger[found.keycode];
  if (found === undefined || finger === undefined || finger === "thumb") {
    return undefined;
  }
  if (!isShiftedLayer(found.layer)) return undefined;
  return isLeftHand(finger) ? "RP" : "LP";
}

const fingerTint: Record<Finger, number> = {
  LP: 0.15,
  RP: 0.15,
  LR: 0.3,
  RR: 0.3,
  LM: 0.45,
  RM: 0.45,
  LI: 0.6,
  RI: 0.6,
  thumb: 0.08,
};

export type FingerTheme = Pick<Theme, "main" | "subAlt" | "sub" | "bg">;

export function fingerColors(
  finger: Finger,
  theme: FingerTheme,
): { bg: string; text: string } {
  const bg = blendTwoHexColors(theme.subAlt, theme.main, fingerTint[finger]);
  return { bg, text: isColorLight(bg) ? theme.bg : theme.sub };
}
