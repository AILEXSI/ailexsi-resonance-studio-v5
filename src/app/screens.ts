import type { TrackId } from "../core/models";

export const PRODUCTION_SCREENS = ["arrange", "cutter"] as const;
export type ProductionScreen = (typeof PRODUCTION_SCREENS)[number];

export const ARRANGE_TRACK_IDS: TrackId[] = ["V1", "V2", "A1", "A2"];
export const CUTTER_TRACK_IDS: TrackId[] = ["V1", "V2"];

export function tracksForScreen(screen: ProductionScreen): TrackId[] {
  return screen === "cutter" ? CUTTER_TRACK_IDS : ARRANGE_TRACK_IDS;
}

export function cycleProductionScreen(
  current: ProductionScreen,
  dir: 1 | -1,
): ProductionScreen {
  const i = PRODUCTION_SCREENS.indexOf(current);
  const next = (i + dir + PRODUCTION_SCREENS.length) % PRODUCTION_SCREENS.length;
  return PRODUCTION_SCREENS[next]!;
}

export function isFormFocus(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (
    el.isContentEditable ||
    el.contentEditable === "true" ||
    el.getAttribute("contenteditable") === "true"
  ) {
    return true;
  }
  if (el.getAttribute("role") === "spinbutton") return true;
  if (el.closest("[contenteditable='true'],[contenteditable=true],[role=spinbutton]")) return true;
  return false;
}
