import type { TrackId } from "../core/models";
import {
  applyClearInOut,
  applyCopy,
  applyCut,
  applyDelete,
  applyExtractRange,
  applyIn,
  applyLiftRange,
  applyMarker,
  applyMoveClips,
  applyNudge,
  applyOut,
  applyPaste,
  applyPause,
  applyPlay,
  applyPlayhead,
  applyPlayPause,
  applyRedo,
  applyRippleDelete,
  applyRippleTrim,
  applyRoll,
  applySelect,
  applySetClipFades,
  applySetTrackPan,
  applyShuttle,
  applySlip,
  applySplit,
  applyStop,
  applyToggleMute,
  applyToggleSolo,
  applyTrim,
  applyUndo,
  type Session,
} from "./session";

/**
 * Named editor commands. UI keys/toolbar and a future AI path share this dispatch.
 * Timeline math stays in core; this is only the session entry.
 */
export type EditorCommand =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "copy" }
  | { type: "cut" }
  | { type: "paste" }
  | { type: "split" }
  | { type: "addMarker" }
  | { type: "clearInOut" }
  | { type: "markIn" }
  | { type: "markOut" }
  | { type: "liftDelete" }
  | { type: "rippleDelete" }
  | { type: "nudgeClip"; deltaMs: number }
  | { type: "nudgePlayhead"; deltaMs: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "playPause" }
  | { type: "stop" }
  | { type: "shuttle"; dir: -1 | 0 | 1 }
  | { type: "toggleMute"; trackId: TrackId }
  | { type: "toggleSolo"; trackId: TrackId }
  | { type: "liftTrim"; clipId: string; edge: "in" | "out"; nextEdgeMs: number }
  | { type: "rippleTrim"; clipId: string; edge: "in" | "out"; nextEdgeMs: number }
  | { type: "rollEdit"; clipId: string; edge: "in" | "out"; nextEdgeMs: number }
  | { type: "select"; clipId: string | null; toggle?: boolean }
  | { type: "moveClips"; clipIds: readonly string[]; deltaMs: number; trackId?: TrackId }
  | { type: "slip"; clipId: string; deltaMs: number }
  | { type: "liftRange" }
  | { type: "extractRange" }
  | { type: "setClipFades"; clipId: string; fadeInMs: number; fadeOutMs: number }
  | { type: "setTrackPan"; trackId: TrackId; pan: number };

export function applyCommand(session: Session, command: EditorCommand): Session {
  switch (command.type) {
    case "undo":
      return applyUndo(session);
    case "redo":
      return applyRedo(session);
    case "copy":
      return applyCopy(session);
    case "cut":
      return applyCut(session);
    case "paste":
      return applyPaste(session);
    case "split":
      return applySplit(session);
    case "addMarker":
      return applyMarker(session);
    case "clearInOut":
      return applyClearInOut(session);
    case "markIn":
      return applyIn(session);
    case "markOut":
      return applyOut(session);
    case "liftDelete":
      return applyDelete(session);
    case "rippleDelete":
      return applyRippleDelete(session);
    case "nudgeClip":
      return applyNudge(session, command.deltaMs);
    case "nudgePlayhead":
      return applyPlayhead(session, session.project.playheadMs + command.deltaMs);
    case "play":
      return applyPlay(session);
    case "pause":
      return applyPause(session);
    case "playPause":
      return applyPlayPause(session);
    case "stop":
      return applyStop(session);
    case "shuttle":
      return applyShuttle(session, command.dir);
    case "toggleMute":
      return applyToggleMute(session, command.trackId);
    case "toggleSolo":
      return applyToggleSolo(session, command.trackId);
    case "liftTrim":
      return applyTrim(session, command.clipId, command.edge, command.nextEdgeMs);
    case "rippleTrim":
      return applyRippleTrim(session, command.clipId, command.edge, command.nextEdgeMs);
    case "rollEdit":
      return applyRoll(session, command.clipId, command.edge, command.nextEdgeMs);
    case "select":
      return applySelect(session, command.clipId, { toggle: command.toggle });
    case "moveClips":
      return applyMoveClips(session, command.clipIds, command.deltaMs, command.trackId);
    case "slip":
      return applySlip(session, command.clipId, command.deltaMs);
    case "liftRange":
      return applyLiftRange(session);
    case "extractRange":
      return applyExtractRange(session);
    case "setClipFades":
      return applySetClipFades(session, command.clipId, command.fadeInMs, command.fadeOutMs);
    case "setTrackPan":
      return applySetTrackPan(session, command.trackId, command.pan);
    default: {
      const _never: never = command;
      return _never;
    }
  }
}
