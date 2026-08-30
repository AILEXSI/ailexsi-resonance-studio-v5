import { FRAME_MS } from "../core/models";
import {
  applyClearInOut,
  applyCopy,
  applyCut,
  applyDelete,
  applyIn,
  applyMarker,
  applyOut,
  applyPaste,
  applyPlayhead,
  applyRedo,
  applySplit,
  applyUndo,
  type Session,
} from "./session";

export interface EditorKeyEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export type EditorKeyAction =
  | { type: "session"; session: Session; preventDefault?: boolean }
  | { type: "toggleShortcuts"; preventDefault: true }
  | { type: "play"; preventDefault: true }
  | { type: "pause"; preventDefault: true }
  | { type: "none" };

/**
 * Editor key routing. Modifier chords run before bare letters.
 * Split is S (not V). Ctrl+V pastes. Ctrl+X cuts. Bare X clears IN/OUT.
 */
export function dispatchEditorKey(
  session: Session,
  playing: boolean,
  e: EditorKeyEvent,
): EditorKeyAction {
  if (e.key === "?") return { type: "toggleShortcuts", preventDefault: true };
  if (e.code === "Space" || e.key === " ") {
    return playing
      ? { type: "pause", preventDefault: true }
      : { type: "play", preventDefault: true };
  }

  const mod = Boolean(e.ctrlKey || e.metaKey);
  const letter = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (mod) {
    if (letter === "z" && !e.shiftKey) {
      return { type: "session", session: applyUndo(session), preventDefault: true };
    }
    if (letter === "y" || (letter === "z" && e.shiftKey)) {
      return { type: "session", session: applyRedo(session), preventDefault: true };
    }
    if (letter === "c") {
      return { type: "session", session: applyCopy(session), preventDefault: true };
    }
    if (letter === "x") {
      return { type: "session", session: applyCut(session), preventDefault: true };
    }
    if (letter === "v") {
      return { type: "session", session: applyPaste(session), preventDefault: true };
    }
    return { type: "none" };
  }

  if (letter === "s") {
    return { type: "session", session: applySplit(session) };
  }
  if (letter === "m") {
    return { type: "session", session: applyMarker(session) };
  }
  if (letter === "x" || (letter === "i" && e.shiftKey)) {
    return { type: "session", session: applyClearInOut(session), preventDefault: true };
  }
  if (letter === "i") {
    return { type: "session", session: applyIn(session) };
  }
  if (letter === "o") {
    return { type: "session", session: applyOut(session) };
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    return { type: "session", session: applyDelete(session) };
  }
  if (e.key === "ArrowLeft") {
    return { type: "session", session: applyPlayhead(session, session.project.playheadMs - FRAME_MS) };
  }
  if (e.key === "ArrowRight") {
    return { type: "session", session: applyPlayhead(session, session.project.playheadMs + FRAME_MS) };
  }
  return { type: "none" };
}
