import { describe, expect, it } from "vitest";
import { resolveLayoutName } from "../../src/ts/utils/layout-name";

describe("resolveLayoutName", () => {
  it("returns a real layout name unchanged", () => {
    expect(resolveLayoutName("dvorak", "overrideSync")).toBe("dvorak");
    expect(resolveLayoutName("dvorak", "canadian_french")).toBe("dvorak");
  });

  it("uses the keymap layout when the layout is default", () => {
    expect(resolveLayoutName("default", "canadian_french")).toBe(
      "canadian_french",
    );
  });

  it("falls back to qwerty for default with overrideSync", () => {
    expect(resolveLayoutName("default", "overrideSync")).toBe("qwerty");
  });
});
