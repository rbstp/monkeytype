import { KeymapLayout, Layout } from "@monkeytype/schemas/configs";
import { LayoutName } from "@monkeytype/schemas/layouts";

export function resolveLayoutName(
  layout: Layout,
  keymapLayout: KeymapLayout,
): LayoutName {
  if (layout !== "default") return layout;
  if (keymapLayout !== "overrideSync") return keymapLayout;
  return "qwerty";
}
