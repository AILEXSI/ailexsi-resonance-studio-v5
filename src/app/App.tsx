import { useCallback, useEffect, useRef, useState } from "react";
import { FRAME_MS, clipById, type TrackId } from "../core/models";
import { advancePlayhead } from "../core/playback";
import { collectSnapTargets, moveClip, placeAsset, snapTime } from "../core/timeline";
import { downloadText, projectFilename } from "../core/project";
import {
  downloadMp4,
  exportTimeline,
  jobFromProject,
  ExportPlanError,
} from "../core/exporter";
import { MediaBrowser } from "../ui/media-browser/MediaBrowser";
import { Preview } from "../ui/preview/Preview";
import { Inspector } from "../ui/inspector/Inspector";
import { Transport } from "../ui/transport/Transport";
import { Timeline } from "../ui/timeline/Timeline";
import {
  applyCopy,
  applyDelete,
  applyIn,
  applyMarker,
  applyOut,
  applyPaste,
  applyPlayhead,
  applyRedo,
  applyScroll,
  applySelect,
  applySplit,
  applyToggleLoop,
  applyToggleSnap,
  applyUndo,
  applyUpdateClip,
  applyZoom,
  createSession,
  hydrateSession,
  importFiles,
  newProject,
  openSerialized,
  projectJson,
  type Session,
} from "./session";

export function App() {
  const [session, setSession] = useState<Session>(() => createSession());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const dragBaseRef = useRef<Session | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    void hydrateSession(sessionRef.current).then(setSession);
    // hydrate once on boot for an empty project is a no-op
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(() => {
    setSession((s) => ({ ...s, playing: true, status: "Playing" }));
  }, []);
  const pause = useCallback(() => {
    setSession((s) => ({ ...s, playing: false, status: "Paused" }));
  }, []);
  const stop = useCallback(() => {
    setSession((s) =>
      applyPlayhead({ ...s, playing: false, status: "Stopped" }, s.project.inPointMs ?? 0),
    );
  }, []);

  useEffect(() => {
    if (!session.playing) {
      lastTs.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const prev = lastTs.current ?? now;
      lastTs.current = now;
      const delta = now - prev;
      setSession((s) => {
        if (!s.playing) return s;
        const stepped = advancePlayhead(s.project, delta);
        if (stepped.stopped) {
          return { ...applyPlayhead(s, stepped.playheadMs), playing: false, status: "Stopped" };
        }
        return applyPlayhead(s, stepped.playheadMs);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [session.playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const s = sessionRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        if (s.playing) pause();
        else play();
        return;
      }
      if (e.key === "v" || e.key === "V") {
        setSession(applySplit(s));
        return;
      }
      if (e.key === "m" || e.key === "M") {
        setSession(applyMarker(s));
        return;
      }
      if (e.key === "i" || e.key === "I") {
        setSession(applyIn(s));
        return;
      }
      if (e.key === "o" || e.key === "O") {
        setSession(applyOut(s));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        setSession(applyUndo(s));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        setSession(applyRedo(s));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        setSession(applyCopy(s));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        setSession(applyPaste(s));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        setSession(applyDelete(s));
        return;
      }
      if (e.key === "ArrowLeft") {
        setSession(applyPlayhead(s, s.project.playheadMs - FRAME_MS));
        return;
      }
      if (e.key === "ArrowRight") {
        setSession(applyPlayhead(s, s.project.playheadMs + FRAME_MS));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, play]);

  const saveProject = () => {
    downloadText(projectFilename(session.project), projectJson(session));
    setSession((s) => ({ ...s, status: "Saved .resonance.json" }));
  };

  const openProject = async (file: File) => {
    const text = await file.text();
    try {
      const opened = openSerialized(session, text);
      const hydrated = await hydrateSession(opened);
      setSession(hydrated);
    } catch (e) {
      setSession((s) => ({
        ...s,
        error: e instanceof Error ? e.message : String(e),
        status: "Open failed",
      }));
    }
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const job = jobFromProject(session.project);
      const result = await exportTimeline(job, {
        onProgress: (p) =>
          setSession((s) => ({ ...s, status: `Export ${p.percent}% ${p.stage}` })),
      });
      if (!result.success || !result.blob) {
        setSession((s) => ({
          ...s,
          error: result.error ?? "Export failed",
          status: "Export failed",
        }));
        return;
      }
      downloadMp4(result);
      setSession((s) => ({
        ...s,
        error: null,
        status: `Exported ${result.fileName} (${result.fileSizeBytes} bytes)`,
      }));
    } catch (e) {
      const msg = e instanceof ExportPlanError || e instanceof Error ? e.message : String(e);
      setSession((s) => ({ ...s, error: `FAIL: ${msg}`, status: "Export failed" }));
    } finally {
      setExporting(false);
    }
  };

  const onMoveLive = (clipId: string, startMs: number, trackId?: TrackId) => {
    setSession((s) => {
      if (!dragBaseRef.current) dragBaseRef.current = s;
      const snapped = s.project.snap
        ? snapTime(startMs, collectSnapTargets(s.project, clipId)).timeMs
        : startMs;
      const result = moveClip(s.project, clipId, snapped, trackId);
      if (result.error) return { ...s, error: result.error };
      return { ...s, project: result.project, selectedClipId: clipId };
    });
  };

  const onMoveCommit = () => {
    const base = dragBaseRef.current;
    dragBaseRef.current = null;
    if (!base) return;
    setSession((s) => ({
      ...s,
      history: { past: [...base.history.past, structuredClone(base.project)], future: [] },
      status: "Moved clip",
      error: null,
    }));
  };

  return (
    <div className="app" data-testid="app">
      <header className="toolbar">
        <strong>AILEXSI Resonance Studio V5</strong>
        <button type="button" onClick={() => setSession(newProject(session))}>
          New
        </button>
        <button type="button" onClick={saveProject}>
          Save
        </button>
        <label>
          Open
          <input
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="open-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void openProject(file);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" onClick={() => document.querySelector<HTMLInputElement>("[data-testid=import-input]")?.click()}>
          Import
        </button>
        <button type="button" onClick={() => setSession(applyUndo(session))}>
          Undo
        </button>
        <button type="button" onClick={() => setSession(applyRedo(session))}>
          Redo
        </button>
        <button type="button" onClick={() => setSession(applySplit(session))}>
          Split
        </button>
        <button type="button" className={session.project.snap ? "active" : ""} onClick={() => setSession(applyToggleSnap(session))}>
          Snap
        </button>
        <button type="button" onClick={() => void runExport()} disabled={exporting}>
          Export MP4
        </button>
      </header>

      <div className="workspace">
        <MediaBrowser
          project={session.project}
          targetTrackId={session.targetTrackId}
          selectedAssetId={selectedAssetId}
          onSelectAsset={setSelectedAssetId}
          onTargetTrack={(id) => setSession((s) => ({ ...s, targetTrackId: id }))}
          onImport={(files) => {
            void importFiles(session, files).then(setSession);
          }}
          onPlace={(assetId) => {
            const asset = session.project.assets.find((a) => a.id === assetId);
            if (!asset) return;
            const trackId: TrackId =
              asset.kind === "video"
                ? session.targetTrackId === "V2"
                  ? "V2"
                  : "V1"
                : session.targetTrackId === "A2"
                  ? "A2"
                  : "A1";
            const result = placeAsset(session.project, assetId, trackId, session.project.playheadMs);
            if (result.error || !result.clip) {
              setSession((s) => ({ ...s, error: result.error ?? "Place failed" }));
              return;
            }
            setSession((s) => ({
              ...s,
              history: { past: [...s.history.past, structuredClone(s.project)], future: [] },
              project: result.project,
              selectedClipId: result.clip!.id,
              status: `Placed ${asset.name}`,
              error: null,
            }));
          }}
        />
        <Preview project={session.project} playing={session.playing} />
        <Inspector
          project={session.project}
          selectedClipId={session.selectedClipId}
          onChange={(clipId, patch) => setSession(applyUpdateClip(session, clipId, patch))}
        />
      </div>

      <Transport
        project={session.project}
        playing={session.playing}
        onPlay={play}
        onPause={pause}
        onStop={stop}
        onStep={(delta) => setSession(applyPlayhead(session, session.project.playheadMs + delta))}
        onToggleLoop={() => setSession(applyToggleLoop(session))}
        onIn={() => setSession(applyIn(session))}
        onOut={() => setSession(applyOut(session))}
        onMarker={() => setSession(applyMarker(session))}
        onSplit={() => setSession(applySplit(session))}
      />

      <Timeline
        project={session.project}
        selectedClipId={session.selectedClipId}
        onSelect={(id) => setSession(applySelect(session, id))}
        onPlayhead={(ms) => setSession(applyPlayhead(session, ms))}
        onMoveLive={onMoveLive}
        onMoveCommit={onMoveCommit}
        onZoom={(z) => setSession(applyZoom(session, z))}
        onScroll={(ms) => setSession(applyScroll(session, ms))}
      />

      <footer className="status" data-testid="status">
        <span>{session.status}</span>
        {session.error ? <span className="err">{session.error}</span> : null}
        {clipById(session.project, session.selectedClipId ?? "") ? (
          <span>clip {session.selectedClipId}</span>
        ) : null}
      </footer>
    </div>
  );
}
