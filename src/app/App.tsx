import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { assetById, clipById, type TrackId } from "../core/models";
import { advancePlayhead } from "../core/playback";
import { collectSnapTargets, moveClip, moveInOut, setInPoint, setOutPoint, snapTime, trimClip } from "../core/timeline";
import { downloadText, projectFilename } from "../core/project";
import { createIndexedDbProjectFileStore } from "../core/project-file-store";
import {
  browserPickerHost,
  emptyProjectFileMemory,
  hasFileSystemAccess,
  lastLoadedStatus,
  loadStatusFallback,
  readFileText,
  rememberFileHandle,
  runChooseFolder,
  runOpen,
  runOpenRecent,
  runSave,
  runSaveAs,
  tryReadGrantedFile,
  type ProjectFileMemory,
  type RecentProject,
} from "../core/project-file";
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
import { Mixer, type MixPeaks } from "../ui/mixer/Mixer";
import { ProjectFilePanel } from "../ui/project-file/ProjectFilePanel";
import { Toolbar } from "../ui/toolbar/Toolbar";
import { ShortcutsOverlay } from "../ui/shortcuts/ShortcutsOverlay";
import {
  applyClearInOut,
  applyCopy,
  applyCut,
  applyDelete,
  applyFit,
  applyIn,
  applyInAt,
  applyMarker,
  applyOut,
  applyOutAt,
  applyPaste,
  applyPlaceAsset,
  applyPlayhead,
  applyRedo,
  applyScroll,
  applySelect,
  applySelectMarker,
  applyDeleteMarker,
  applyMoveMarker,
  applySplit,
  applyToggleLoop,
  applyMasterVolume,
  applyTrackVolume,
  applyToggleMute,
  applyToggleVisualizerMute,
  applyCycleVisualizerScene,
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
import { dispatchEditorKey } from "./keys";
import {
  ARRANGE_MIN_PX,
  INSPECTOR_MIN_PX,
  PREVIEW_H_MIN_PX,
  PREVIEW_MIN_PX,
  applyHSplitPointer,
  applySplitPointer,
  browserLayoutStorage,
  loadHSplitRatio,
  loadMixerCollapsed,
  loadSplitRatio,
  saveHSplitRatio,
  saveMixerCollapsed,
  saveSplitRatio,
} from "../core/layout-prefs";

export function App() {
  const [session, setSession] = useState<Session>(() => createSession());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const dragBaseRef = useRef<Session | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [mixPeaks, setMixPeaks] = useState<MixPeaks>({
    V1: 0,
    V2: 0,
    A1: 0,
    A2: 0,
    master: 0,
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const layoutStore = browserLayoutStorage();
  const [mixerCollapsed, setMixerCollapsed] = useState(() => loadMixerCollapsed(layoutStore));
  const [splitRatio, setSplitRatio] = useState(() => loadSplitRatio(layoutStore));
  const splitRatioRef = useRef(splitRatio);
  splitRatioRef.current = splitRatio;
  const [hSplitRatio, setHSplitRatio] = useState(() => loadHSplitRatio(layoutStore));
  const hSplitRatioRef = useRef(hSplitRatio);
  hSplitRatioRef.current = hSplitRatio;
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const projectPanelOpenRef = useRef(false);
  projectPanelOpenRef.current = projectPanelOpen;
  const stageRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const splitDragRef = useRef(false);
  const hSplitDragRef = useRef(false);
  const [projectFile, setProjectFile] = useState<ProjectFileMemory>(emptyProjectFileMemory);
  const projectFileRef = useRef(projectFile);
  projectFileRef.current = projectFile;
  const projectFileStore = useRef(createIndexedDbProjectFileStore()).current;
  const pickerHost = browserPickerHost();
  const fsa = hasFileSystemAccess(pickerHost);
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      const hydrated = await hydrateSession(sessionRef.current);
      const memory = await projectFileStore.load();
      setProjectFile(memory);
      const last = await tryReadGrantedFile(memory);
      if (last?.kind === "ready") {
        try {
          const opened = openSerialized(hydrated, last.text);
          const next = await hydrateSession(opened);
          setSession({ ...next, status: `Geladen: ${last.fileName}` });
          return;
        } catch {
          setSession({ ...hydrated, status: lastLoadedStatus(last.fileName) });
          return;
        }
      }
      if (last?.kind === "needsOpen") {
        setSession({ ...hydrated, status: lastLoadedStatus(last.fileName) });
        return;
      }
      setSession(hydrated);
    })();
    // hydrate once on boot
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
      if (e.key === "Escape" && projectPanelOpenRef.current) {
        e.preventDefault();
        setProjectPanelOpen(false);
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const s = sessionRef.current;
      const action = dispatchEditorKey(s, s.playing, e);
      if (action.type === "none") return;
      if ("preventDefault" in action && action.preventDefault) e.preventDefault();
      if (action.type === "toggleShortcuts") {
        setShortcutsOpen((open) => !open);
        return;
      }
      if (action.type === "play") {
        play();
        return;
      }
      if (action.type === "pause") {
        pause();
        return;
      }
      setSession(action.session);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, play]);

  const applyOpenedText = async (text: string, status: string) => {
    const opened = openSerialized(sessionRef.current, text);
    const hydrated = await hydrateSession(opened);
    setSession({ ...hydrated, status, error: null });
  };

  const persistSave = (
    runner: typeof runSave | typeof runSaveAs,
  ) => {
    void (async () => {
      try {
        const result = await runner({
          host: pickerHost,
          store: projectFileStore,
          memory: projectFileRef.current,
          filename: projectFilename(sessionRef.current.project),
          json: projectJson(sessionRef.current),
          fallbackDownload: downloadText,
        });
        if (result.cancelled) return;
        setProjectFile(result.memory);
        if (!result.usedFallback) setProjectPanelOpen(false);
        setSession((s) => ({ ...s, status: result.status, error: null }));
      } catch (e) {
        setSession((s) => ({
          ...s,
          error: e instanceof Error ? e.message : String(e),
          status: "Save failed",
        }));
      }
    })();
  };

  const saveProject = () => persistSave(runSave);
  const saveProjectAs = () => persistSave(runSaveAs);

  const chooseFolder = () => {
    void (async () => {
      try {
        const result = await runChooseFolder({
          host: pickerHost,
          store: projectFileStore,
          memory: projectFileRef.current,
        });
        if (result.cancelled) return;
        setProjectFile(result.memory);
        setSession((s) => ({ ...s, status: result.status, error: null }));
      } catch (e) {
        setSession((s) => ({
          ...s,
          error: e instanceof Error ? e.message : String(e),
          status: "Folder pick failed",
        }));
      }
    })();
  };

  const openWithPicker = () => {
    void (async () => {
      try {
        const result = await runOpen({
          host: pickerHost,
          store: projectFileStore,
          memory: projectFileRef.current,
        });
        if (result.kind === "cancelled") return;
        if (result.kind === "fallback") {
          document.querySelector<HTMLInputElement>("[data-testid=open-input]")?.click();
          return;
        }
        setProjectFile(result.memory);
        await applyOpenedText(result.text, result.status);
        setProjectPanelOpen(false);
      } catch (e) {
        setSession((s) => ({
          ...s,
          error: e instanceof Error ? e.message : String(e),
          status: "Open failed",
        }));
      }
    })();
  };

  const openLast = () => {
    void (async () => {
      const last = await tryReadGrantedFile(projectFileRef.current);
      if (last?.kind === "ready") {
        await applyOpenedText(last.text, `Geladen: ${last.fileName}`);
        setProjectPanelOpen(false);
        return;
      }
      const handle = projectFileRef.current.fileHandle;
      if (handle?.requestPermission) {
        const perm = await handle.requestPermission({ mode: "read" });
        if (perm === "granted" && handle.getFile) {
          const file = await handle.getFile();
          const memory = await rememberFileHandle(projectFileStore, handle, projectFileRef.current);
          setProjectFile(memory);
          await applyOpenedText(await readFileText(file), `Geladen: ${file.name}`);
          setProjectPanelOpen(false);
          return;
        }
      }
      openWithPicker();
    })();
  };

  const openRecent = (recent: RecentProject) => {
    void (async () => {
      try {
        const result = await runOpenRecent({
          store: projectFileStore,
          memory: projectFileRef.current,
          recent,
        });
        if (result.kind === "opened") {
          setProjectFile(result.memory);
          await applyOpenedText(result.text, result.status);
          setProjectPanelOpen(false);
          return;
        }
        openWithPicker();
      } catch (e) {
        setSession((s) => ({
          ...s,
          error: e instanceof Error ? e.message : String(e),
          status: "Open failed",
        }));
      }
    })();
  };

  const openProject = async (file: File) => {
    try {
      const text = await readFileText(file);
      await applyOpenedText(text, loadStatusFallback(file.name));
      setProjectPanelOpen(false);
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

  const onMarkerMoveLive = (markerId: string, timeMs: number) => {
    setSession((s) => {
      if (!dragBaseRef.current) dragBaseRef.current = s;
      return applyMoveMarker(s, markerId, timeMs);
    });
  };

  const onMarkerMoveCommit = () => {
    const base = dragBaseRef.current;
    dragBaseRef.current = null;
    if (!base) return;
    setSession((s) => ({
      ...s,
      history: { past: [...base.history.past, structuredClone(base.project)], future: [] },
      status: "Moved marker",
      error: null,
    }));
  };

  const onTrimLive = (clipId: string, edge: "in" | "out", nextEdgeMs: number) => {
    setSession((s) => {
      if (!dragBaseRef.current) dragBaseRef.current = s;
      const result = trimClip(s.project, clipId, edge, nextEdgeMs);
      if (result.error) return { ...s, error: result.error };
      return { ...s, project: result.project, selectedClipId: clipId, error: null };
    });
  };

  const onTrimCommit = () => {
    const base = dragBaseRef.current;
    dragBaseRef.current = null;
    if (!base) return;
    setSession((s) => ({
      ...s,
      history: { past: [...base.history.past, structuredClone(base.project)], future: [] },
      status: "Trimmed clip",
      error: null,
    }));
  };

  const onLoopClick = (ms: number) => {
    setSession((s) => {
      if (s.project.inPointMs != null && s.project.outPointMs == null) {
        return applyOutAt(s, ms);
      }
      return applyInAt(s, ms);
    });
  };

  const onLoopInLive = (ms: number) => {
    setSession((s) => {
      if (!dragBaseRef.current) dragBaseRef.current = s;
      const result = setInPoint(s.project, ms, { replace: true });
      if (result.error) return s;
      return { ...s, project: result.project, error: null };
    });
  };

  const onLoopOutLive = (ms: number) => {
    setSession((s) => {
      if (!dragBaseRef.current) dragBaseRef.current = s;
      const result = setOutPoint(s.project, ms, { replace: true });
      if (result.error) return s;
      return { ...s, project: result.project, error: null };
    });
  };

  const onLoopMoveLive = (deltaMs: number) => {
    setSession((s) => {
      if (!dragBaseRef.current) dragBaseRef.current = s;
      const result = moveInOut(dragBaseRef.current.project, deltaMs);
      if (result.error) return s;
      return { ...s, project: result.project, error: null };
    });
  };

  const toggleMixerCollapsed = () => {
    setMixerCollapsed((prev) => {
      const next = !prev;
      saveMixerCollapsed(layoutStore, next);
      return next;
    });
  };

  const applySplitFromEvent = (clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const next = applySplitPointer({
      clientY,
      stageTop: rect.top,
      stageHeight: rect.height,
    });
    setSplitRatio(next.ratio);
  };

  const onSplitPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    splitDragRef.current = true;
    applySplitFromEvent(e.clientY);
    const move = (ev: PointerEvent) => {
      if (!splitDragRef.current) return;
      applySplitFromEvent(ev.clientY);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!splitDragRef.current) return;
      splitDragRef.current = false;
      saveSplitRatio(layoutStore, splitRatioRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const applyHSplitFromEvent = (clientX: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    const next = applyHSplitPointer({
      clientX,
      workspaceLeft: rect.left,
      workspaceWidth: rect.width,
    });
    setHSplitRatio(next.ratio);
  };

  const onHSplitPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    hSplitDragRef.current = true;
    applyHSplitFromEvent(e.clientX);
    const move = (ev: PointerEvent) => {
      if (!hSplitDragRef.current) return;
      applyHSplitFromEvent(ev.clientX);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!hSplitDragRef.current) return;
      hSplitDragRef.current = false;
      saveHSplitRatio(layoutStore, hSplitRatioRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const openProjectPanel = () => setProjectPanelOpen(true);
  const closeProjectPanel = () => setProjectPanelOpen(false);

  const onToolbarSave = () => {
    openProjectPanel();
  };
  const onToolbarOpen = () => {
    openProjectPanel();
  };
  const onToolbarOpenLast = () => {
    openProjectPanel();
    openLast();
  };

  const onLoopCommit = () => {
    const base = dragBaseRef.current;
    dragBaseRef.current = null;
    if (!base) return;
    setSession((s) => ({
      ...s,
      history: { past: [...base.history.past, structuredClone(base.project)], future: [] },
      status: "Loop range",
      error: null,
    }));
  };

  return (
    <div className="app" data-testid="app">
      <Toolbar
        snap={session.project.snap}
        exporting={exporting}
        onNew={() => setSession(newProject(session))}
        onSave={onToolbarSave}
        onOpen={onToolbarOpen}
        onOpenLast={onToolbarOpenLast}
        lastFileName={projectFile.lastFileName}
        fileSystemAccess={fsa}
        onOpenFile={(file) => void openProject(file)}
        onImport={() => document.querySelector<HTMLInputElement>("[data-testid=import-input]")?.click()}
        onExport={() => void runExport()}
        onUndo={() => setSession(applyUndo(session))}
        onRedo={() => setSession(applyRedo(session))}
        onSplit={() => setSession(applySplit(session))}
        onToggleSnap={() => setSession(applyToggleSnap(session))}
      />
      <input
        type="file"
        accept="audio/*,video/*"
        multiple
        hidden
        data-testid="import-input"
        onChange={(e) => {
          if (e.target.files) void importFiles(session, e.target.files).then(setSession);
          e.target.value = "";
        }}
      />

      {projectPanelOpen ? (
        <div className="project-overlay" data-testid="project-overlay">
          <div
            className="project-overlay-backdrop"
            data-testid="project-overlay-backdrop"
            onClick={closeProjectPanel}
          />
          <div className="project-overlay-drawer" role="dialog" aria-label="Projekt">
            <ProjectFilePanel
              memory={projectFile}
              fileSystemAccess={fsa}
              onSave={saveProject}
              onSaveAs={saveProjectAs}
              onOpen={openWithPicker}
              onChooseFolder={chooseFolder}
              onOpenRecent={openRecent}
            />
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
                setSession((s) => applyPlaceAsset(s, assetId, trackId));
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="stage" data-testid="stage" ref={stageRef}>
      <div
        className="workspace"
        data-testid="preview-pane"
        data-preview-ratio={splitRatio}
        data-h-split-ratio={hSplitRatio}
        ref={workspaceRef}
        style={{ flex: `${splitRatio} 1 ${PREVIEW_MIN_PX}px` }}
      >
        <div
          className="workspace-preview"
          data-testid="workspace-preview"
          style={{ flex: `${hSplitRatio} 1 ${PREVIEW_H_MIN_PX}px` }}
        >
          <Preview project={session.project} playing={session.playing} onLevels={setMixPeaks} />
        </div>
        <div
          className="layout-split-v"
          data-testid="layout-split-h"
          role="separator"
          aria-orientation="vertical"
          aria-label="Preview und Inspector teilen"
          onPointerDown={onHSplitPointerDown}
        />
        <div
          className="workspace-inspector"
          data-testid="workspace-inspector"
          style={{ flex: `${1 - hSplitRatio} 1 ${INSPECTOR_MIN_PX}px` }}
        >
          <Inspector
            project={session.project}
            selectedClipId={session.selectedClipId}
            onChange={(clipId, patch) => setSession(applyUpdateClip(session, clipId, patch))}
          />
        </div>
      </div>

      <div
        className="layout-split"
        data-testid="layout-split"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Preview und Arrange teilen"
        style={{ cursor: "ns-resize" }}
        onPointerDown={onSplitPointerDown}
      />

      <div
        className="lower-stage"
        data-testid="lower-stage"
        style={{ flex: `${1 - splitRatio} 1 ${ARRANGE_MIN_PX}px` }}
      >
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
        onClear={() => setSession(applyClearInOut(session))}
        onMarker={() => setSession(applyMarker(session))}
        onSplit={() => setSession(applySplit(session))}
      />

      <div
        className={`arrange-row${mixerCollapsed ? " mixer-collapsed" : ""}`}
        data-testid="arrange-row"
        style={{ overflowY: "auto" }}
      >
      <Timeline
        project={session.project}
        selectedClipId={session.selectedClipId}
        selectedMarkerId={session.selectedMarkerId}
        onSelect={(id) => setSession(applySelect(session, id))}
        onSelectMarker={(id) => setSession(applySelectMarker(session, id))}
        onMarkerMoveLive={onMarkerMoveLive}
        onMarkerMoveCommit={onMarkerMoveCommit}
        onDeleteMarker={(id) => setSession(applyDeleteMarker(session, id))}
        onPlayhead={(ms) => setSession(applyPlayhead(session, ms))}
        onMoveLive={onMoveLive}
        onMoveCommit={onMoveCommit}
        onTrimLive={onTrimLive}
        onTrimCommit={onTrimCommit}
        onToggleMute={(id) => setSession(applyToggleMute(session, id))}
        onToggleVisualizerMute={() => setSession(applyToggleVisualizerMute(session))}
        onCycleVisualizerScene={() => setSession(applyCycleVisualizerScene(session))}
        onSplitHere={(clipId, timeMs) => {
          setSession((s) => applySplit(applyPlayhead(applySelect(s, clipId), timeMs)));
        }}
        onCut={() => setSession(applyCut(session))}
        onCopy={() => setSession(applyCopy(session))}
        onPaste={() => setSession(applyPaste(session))}
        onDelete={() => setSession(applyDelete(session))}
        onZoom={(z, widthPx) => setSession(applyZoom(session, z, widthPx))}
        onFit={(widthPx) => setSession(applyFit(session, widthPx))}
        onScroll={(ms) => setSession(applyScroll(session, ms))}
        onLoopClick={onLoopClick}
        onLoopInLive={onLoopInLive}
        onLoopOutLive={onLoopOutLive}
        onLoopMoveLive={onLoopMoveLive}
        onLoopCommit={onLoopCommit}
      />
      <Mixer
        project={session.project}
        selectedTrackId={session.targetTrackId}
        peaks={mixPeaks}
        collapsed={mixerCollapsed}
        onToggleCollapsed={toggleMixerCollapsed}
        onSelectTrack={(id) => setSession((s) => ({ ...s, targetTrackId: id }))}
        onVolume={(id, v) => setSession(applyTrackVolume(session, id, v))}
        onMasterVolume={(v) => setSession(applyMasterVolume(session, v))}
        onToggleMute={(id) => setSession(applyToggleMute(session, id))}
      />
      </div>
      </div>
      </div>

      <ShortcutsOverlay open={shortcutsOpen} />

      <footer className="status" data-testid="status">
        <span>{session.status}</span>
        {session.error ? <span className="err">{session.error}</span> : null}
        {(() => {
          const selected = clipById(session.project, session.selectedClipId ?? "");
          if (!selected) return null;
          const asset = assetById(session.project, selected.assetId);
          return <span>{asset?.name ?? selected.id}</span>;
        })()}
      </footer>
    </div>
  );
}
