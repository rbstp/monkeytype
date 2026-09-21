import { LayoutObject } from "@monkeytype/schemas/layouts";
import { Keycode } from "../constants/keys";
import { keycodeToLayoutKey } from "../utils/key-converter";

export type DeadKey = {
  dead: Keycode;
  deadLayer: number;
  legend: string;
  base: Keycode;
};

export type DeadKeyTable = Record<string, DeadKey>;

type DeadKeyDefinition = Omit<DeadKey, "base">;

function withBases(
  dead: DeadKeyDefinition,
  bases: Record<string, Keycode>,
): DeadKeyTable {
  return Object.fromEntries(
    Object.entries(bases).map(([char, base]) => [char, { ...dead, base }]),
  );
}

const canadianFrenchGrave: DeadKeyDefinition = {
  dead: "Quote",
  deadLayer: 0,
  legend: "`",
};
const canadianFrenchCircumflex: DeadKeyDefinition = {
  dead: "BracketLeft",
  deadLayer: 0,
  legend: "^",
};
const canadianFrenchDiaeresis: DeadKeyDefinition = {
  dead: "BracketRight",
  deadLayer: 1,
  legend: "¨",
};

// the layout files carry no dead-key data, so each layout that has a track lists its own
export const DEAD_KEYS: Record<string, DeadKeyTable> = {
  canadian_french: {
    ...withBases(canadianFrenchGrave, { è: "KeyE", à: "KeyA", ù: "KeyU" }),
    ...withBases(canadianFrenchCircumflex, {
      ê: "KeyE",
      â: "KeyA",
      î: "KeyI",
      ô: "KeyO",
      û: "KeyU",
    }),
    ...withBases(canadianFrenchDiaeresis, {
      ë: "KeyE",
      ï: "KeyI",
      ü: "KeyU",
    }),
  },
};

function matches(table: DeadKeyTable, layout: LayoutObject): boolean {
  return Object.values(table).every(
    (entry) =>
      keycodeToLayoutKey(entry.dead, layout, entry.deadLayer) === entry.legend,
  );
}

/**
 * A layout object carries no name, so the table is picked by checking that its
 * dead legends sit where the table says.
 */
export function deadKeyTable(
  layout: LayoutObject | string,
): DeadKeyTable | undefined {
  if (typeof layout === "string") return DEAD_KEYS[layout];
  return Object.values(DEAD_KEYS).find((table) => matches(table, layout));
}

export function deadKeyFor(
  char: string,
  layout: LayoutObject,
): DeadKey | undefined {
  return deadKeyTable(layout)?.[char];
}

export function hasDeadKeys(layoutName: string): boolean {
  return DEAD_KEYS[layoutName] !== undefined;
}
