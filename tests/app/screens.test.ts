import { describe, expect, it } from "vitest";
import {
  PRODUCTION_SCREENS,
  cycleProductionScreen,
  isFormFocus,
  tracksForScreen,
} from "../../src/app/screens";

describe("production screens", () => {
  it("TAB cycles arrange → cutter → arrange", () => {
    expect(PRODUCTION_SCREENS).toEqual(["arrange", "cutter"]);
    expect(cycleProductionScreen("arrange", 1)).toBe("cutter");
    expect(cycleProductionScreen("cutter", 1)).toBe("arrange");
    expect(tracksForScreen("arrange")).toEqual(["V1", "V2", "A1", "A2"]);
    expect(tracksForScreen("cutter")).toEqual(["V1", "V2"]);
  });

  it("Shift+TAB cycles reverse", () => {
    expect(cycleProductionScreen("arrange", -1)).toBe("cutter");
    expect(cycleProductionScreen("cutter", -1)).toBe("arrange");
  });

  it("isFormFocus matches input/textarea/select/contenteditable/spinbutton", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const spin = document.createElement("div");
    spin.setAttribute("role", "spinbutton");
    const edit = document.createElement("div");
    edit.contentEditable = "true";
    const div = document.createElement("div");
    expect(isFormFocus(input)).toBe(true);
    expect(isFormFocus(textarea)).toBe(true);
    expect(isFormFocus(select)).toBe(true);
    expect(isFormFocus(spin)).toBe(true);
    expect(isFormFocus(edit)).toBe(true);
    expect(isFormFocus(div)).toBe(false);
    expect(isFormFocus(null)).toBe(false);
  });
});
