import { firstClipIdWithLivingMate } from "../core/link";
import { FRAME_MS } from "../core/models";
import { isSlideBlock } from "../core/timeline";
import { applyCommand, type EditorCommand } from "./commands";
import { selectionOf, type Session } from "./session";

export interface EditorKeyEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  /** True when focus is an input/textarea/select/contenteditable/spinbutton. */
  formFocus?: boolean;
}

export type EditorKeyAction =
  | { type: "session"; session: Session; preventDefault?: boolean }
  | { type: "toggleShortcuts"; preventDefault: true }
  | { type: "cycleScreen"; dir: 1 | -1; preventDefault: true }
  | { type: "none" };

function commandFromKey(
  e: EditorKeyEvent,
  session: Session,
): EditorCommand | "toggleShortcuts" | null {
  if (e.key === "?") return "toggleShortcuts";

  const mod = Boolean(e.ctrlKey || e.metaKey);
  const letter = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (e.code === "Space" || e.key === " ") return { type: "playPause" };

  if (mod) {
    if (letter === "z" && !e.shiftKey) return { type: "undo" };
    if (letter === "y" || (letter === "z" && e.shiftKey)) return { type: "redo" };
    if (letter === "c") return { type: "copy" };
    if (letter === "x") return { type: "cut" };
    if (letter === "v") return { type: "paste" };
    if (letter === "l" && e.shiftKey) {
      const clipId = firstClipIdWithLivingMate(session.project, selectionOf(session));
      return clipId ? { type: "unlinkClips", clipId } : null;
    }
    return null;
  }

  const comma = e.key === "," || e.key === "<" || e.code === "Comma";
  const period = e.key === "." || e.key === ">" || e.code === "Period";
  if (e.altKey && (comma || period)) {
    if (!session.selectedClipId) return null;
    const deltaMs = (period ? 1 : -1) * FRAME_MS;
    if (e.shiftKey) {
      const ids = selectionOf(session);
      if (ids.length >= 2 && isSlideBlock(session.project, ids)) {
        return { type: "slideClip", clipId: session.selectedClipId ?? ids[0]!, clipIds: ids, deltaMs };
      }
      return { type: "slideClip", clipId: session.selectedClipId, deltaMs };
    }
    const ids = selectionOf(session);
    if (ids.length >= 2) {
      return { type: "slip", clipId: session.selectedClipId ?? ids[0]!, clipIds: ids, deltaMs };
    }
    return { type: "slip", clipId: session.selectedClipId, deltaMs };
  }

  if (letter === "s") return { type: "split" };
  if (letter === "m") return { type: "addMarker" };
  if (letter === "x" || (letter === "i" && e.shiftKey)) return { type: "clearInOut" };
  if (letter === "i") return { type: "markIn" };
  if (letter === "o") return { type: "markOut" };
  if (letter === "j") return { type: "shuttle", dir: -1 };
  if (letter === "k") return { type: "shuttle", dir: 0 };
  if (letter === "l") return { type: "shuttle", dir: 1 };

  if (e.key === ";" || e.code === "Semicolon") return { type: "liftRange" };
  if (e.key === "'" || e.key === '"' || e.code === "Quote") return { type: "extractRange" };

  if (e.key === "Delete" || e.key === "Backspace") {
    return e.shiftKey ? { type: "rippleDelete" } : { type: "liftDelete" };
  }
  if (e.key === "ArrowLeft") return { type: "nudgePlayhead", deltaMs: -FRAME_MS };
  if (e.key === "ArrowRight") return { type: "nudgePlayhead", deltaMs: FRAME_MS };

  if (comma || period) {
    const frames = e.shiftKey || e.key === "<" || e.key === ">" ? 10 : 1;
    return { type: "nudgeClip", deltaMs: (period ? 1 : -1) * frames * FRAME_MS };
  }
  return null;
}

/**
 * Editor key routing. Modifier chords run before bare letters.
 * Split is S (not V). Ctrl+V pastes. Ctrl+X cuts. Bare X clears IN/OUT.
 * All mutations go through `applyCommand`.
 */
export function dispatchEditorKey(
  session: Session,
  _playing: boolean,
  e: EditorKeyEvent,
): EditorKeyAction {
  if (e.key === "Tab") {
    if (e.formFocus) return { type: "none" };
    return { type: "cycleScreen", dir: e.shiftKey ? -1 : 1, preventDefault: true };
  }
  const command = commandFromKey(e, session);
  if (!command) return { type: "none" };
  if (command === "toggleShortcuts") return { type: "toggleShortcuts", preventDefault: true };
  const preventDefault =
    command.type === "playPause" ||
    command.type === "undo" ||
    command.type === "redo" ||
    command.type === "copy" ||
    command.type === "cut" ||
    command.type === "paste" ||
    command.type === "clearInOut" ||
    command.type === "liftDelete" ||
    command.type === "rippleDelete" ||
    command.type === "nudgeClip" ||
    command.type === "shuttle" ||
    command.type === "slip" ||
    command.type === "slideClip" ||
    command.type === "liftRange" ||
    command.type === "extractRange" ||
    command.type === "unlinkClips";
  return {
    type: "session",
    session: applyCommand(session, command),
    preventDefault,
  };
}
