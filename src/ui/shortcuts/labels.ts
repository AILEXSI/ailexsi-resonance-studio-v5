/**
 * Windows shortcut labels (Ctrl, not Cmd). Must match `dispatchEditorKey`.
 * Display only — do not invent new bindings here.
 */
export const CLIP_MENU_SHORTCUTS = {
  split: "S",
  cut: "Ctrl+X",
  copy: "Ctrl+C",
  paste: "Ctrl+V",
  delete: "Delete",
} as const;

export const SHORTCUT_ROWS: { key: string; action: string }[] = [
  { key: "Space", action: "Play / Pause" },
  { key: CLIP_MENU_SHORTCUTS.split, action: "Split at playhead" },
  { key: "I", action: "Set IN" },
  { key: "O", action: "Set OUT" },
  { key: "Right-click ruler", action: "IN then OUT" },
  { key: "X", action: "Clear IN/OUT" },
  { key: "M", action: "Add marker" },
  { key: CLIP_MENU_SHORTCUTS.delete, action: "Delete clip or marker" },
  { key: "← / →", action: "Step ±1 frame" },
  { key: "Ctrl+Z", action: "Undo" },
  { key: "Ctrl+Y", action: "Redo" },
  { key: CLIP_MENU_SHORTCUTS.cut, action: "Cut" },
  { key: CLIP_MENU_SHORTCUTS.copy, action: "Copy" },
  { key: CLIP_MENU_SHORTCUTS.paste, action: "Paste" },
  { key: "?", action: "Toggle this sheet" },
];
