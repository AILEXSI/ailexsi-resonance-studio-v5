import { useEffect, useRef } from "react";
import {
  TRACK_IDS,
  clipById,
  clipOnTrackAt,
  isTrackAudible,
  mixClipsAt,
  projectDurationMs,
  sourceTimeAt,
  topVideoClipAt,
  trackPanOf,
  trackVolumeOf,
  type Project,
  type TrackId,
} from "../../core/models";
import { vClipMixesOwnAudio } from "../../core/link";
import { gainAtClipTime, videoAlphaAtClipTime } from "../../core/fades";
import {
  compositeVideoAt,
  contextFromProject,
  formatResolvedSource,
  primaryLayer,
  resolvePictureSource,
  transitionAudioGain,
} from "../../core/transition";
import { mixLinearGain } from "../../core/volume";

export { compositeVideoAt as previewComposite } from "../../core/transition";
import type { MixPeaks } from "../mixer/Mixer";
import {
  featuresAt,
  renderVisualizerScene,
  sceneAt,
  shouldShowVisualizer,
} from "../../core/visualizer";
import { createPlaybackTap, preferLiveFeatures, type PlaybackTap } from "../../core/visualz/playback-tap";
import { loadStill, paintStill } from "../../core/still";

interface Props {
  project: Project;
  playing: boolean;
  onLevels?: (peaks: MixPeaks) => void;
}

export function Preview({ project, playing, onLevels }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stillRef = useRef<HTMLCanvasElement>(null);
  const v1Ref = useRef<HTMLAudioElement>(null);
  const v2Ref = useRef<HTMLAudioElement>(null);
  const a1Ref = useRef<HTMLAudioElement>(null);
  const a2Ref = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPlayheadRef = useRef(project.playheadMs);
  const tapRef = useRef<PlaybackTap | null>(null);

  const pictureCtx = contextFromProject(project);
  const composite = compositeVideoAt(pictureCtx, project.playheadMs);
  const picture = resolvePictureSource(pictureCtx, project.playheadMs);
  const hideVideo = picture.source === "vis" || picture.source === "black";
  const primary = primaryLayer(composite);
  const videoClip = hideVideo
    ? undefined
    : (primary ? clipById(project, primary.clipId) : undefined) ??
      topVideoClipAt(project, project.playheadMs);
  const layerA = primary && videoClip && primary.clipId === videoClip.id ? primary.alpha : 1;
  const videoAsset = videoClip
    ? project.assets.find((a) => a.id === videoClip.assetId)
    : undefined;
  const isStill = videoAsset?.kind === "image";
  const mixClips = mixClipsAt(project, project.playheadMs);
  const showViz = shouldShowVisualizer(project, project.playheadMs);

  useEffect(() => {
    if (isStill) return;
    const video = videoRef.current;
    if (!video || !videoClip || !videoAsset?.objectUrl) return;
    const want = sourceTimeAt(videoClip, project.playheadMs) / 1000;
    if (Math.abs(video.currentTime - want) > 0.08) {
      video.currentTime = want;
    }
    video.playbackRate = videoClip.rate > 0 ? videoClip.rate : 1;
    if (playing && video.paused) void video.play().catch(() => undefined);
    if (!playing && !video.paused) video.pause();
  }, [project.playheadMs, playing, videoClip, videoAsset?.objectUrl, isStill]);

  useEffect(() => {
    if (!isStill || !videoClip || !videoAsset?.objectUrl) return;
    const canvas = stillRef.current;
    if (!canvas) return;
    let cancelled = false;
    const alpha =
      layerA * videoAlphaAtClipTime(videoClip, project.playheadMs - videoClip.startMs);
    void (async () => {
      try {
        const img = await loadStill(videoAsset.objectUrl!);
        if (cancelled) return;
        const parent = canvas.parentElement;
        const cssW = parent?.clientWidth || canvas.clientWidth || 640;
        const cssH = parent?.clientHeight || canvas.clientHeight || 360;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(cssW * dpr));
        const h = Math.max(1, Math.floor(cssH * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        paintStill(ctx, canvas, img, alpha);
      } catch {
        /* missing still */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStill, videoClip, videoAsset?.objectUrl, project.playheadMs, layerA]);

  useEffect(() => {
    const bind = (el: HTMLAudioElement | null, trackId: TrackId) => {
      if (!el) return;
      const clip = isTrackAudible(project, trackId)
        ? clipOnTrackAt(project, trackId, project.playheadMs)
        : undefined;
      const asset = clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
      if (clip && !vClipMixesOwnAudio(project, clip, project.playheadMs)) {
        el.pause();
        el.removeAttribute("src");
        return;
      }
      if (!clip || !asset?.objectUrl) {
        el.pause();
        el.removeAttribute("src");
        return;
      }
      if (el.src !== asset.objectUrl) el.src = asset.objectUrl;
      const mix =
        mixLinearGain(
          gainAtClipTime(clip, project.playheadMs - clip.startMs),
          trackVolumeOf(project, trackId),
          project.masterVolume ?? 1,
          !isTrackAudible(project, trackId),
        ) * transitionAudioGain(project.transitions ?? [], clip.id, project.playheadMs, project);
      const tap = tapRef.current;
      if (tap) {
        el.volume = 1;
      } else {
        el.volume = Math.max(0, Math.min(1, mix));
      }
      const want = sourceTimeAt(clip, project.playheadMs) / 1000;
      if (Math.abs(el.currentTime - want) > 0.08) el.currentTime = want;
      el.playbackRate = clip.rate > 0 ? clip.rate : 1;
      if (playing && el.paused) void el.play().catch(() => undefined);
      if (!playing && !el.paused) el.pause();
    };
    bind(v1Ref.current, "V1");
    bind(v2Ref.current, "V2");
    bind(a1Ref.current, "A1");
    bind(a2Ref.current, "A2");
  }, [mixClips, playing, project.assets, project.playheadMs, project.tracks, project.masterVolume]);

  useEffect(() => {
    if (tapRef.current) return;
    const tap = createPlaybackTap({
      V1: v1Ref.current,
      V2: v2Ref.current,
      A1: a1Ref.current,
      A2: a2Ref.current,
    });
    if (!tap) return;
    tapRef.current = tap;
    return () => {
      tap.disconnect();
      tapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (playing) tapRef.current?.resume();
  }, [playing]);

  useEffect(() => {
    const tap = tapRef.current;
    if (!tap) return;
    const gainOf = (trackId: TrackId) => {
      if (!isTrackAudible(project, trackId)) return 0;
      const clip = clipOnTrackAt(project, trackId, project.playheadMs);
      if (!clip || !vClipMixesOwnAudio(project, clip, project.playheadMs)) return 0;
      return (
        mixLinearGain(
          gainAtClipTime(clip, project.playheadMs - clip.startMs),
          trackVolumeOf(project, trackId),
          1,
          false,
        ) * transitionAudioGain(project.transitions ?? [], clip.id, project.playheadMs, project)
      );
    };
    tap.setGains({
      V1: gainOf("V1"),
      V2: gainOf("V2"),
      A1: gainOf("A1"),
      A2: gainOf("A2"),
      master: project.masterVolume ?? 1,
      V1pan: trackPanOf(project, "V1"),
      V2pan: trackPanOf(project, "V2"),
      A1pan: trackPanOf(project, "A1"),
      A2pan: trackPanOf(project, "A2"),
    });
  }, [mixClips, project]);

  useEffect(() => {
    if (!playing || !onLevels) return;
    let raf = 0;
    const tick = () => {
      const p = tapRef.current?.peaks();
      onLevels({
        V1: p?.V1 ?? 0,
        V2: p?.V2 ?? 0,
        A1: p?.A1 ?? 0,
        A2: p?.A2 ?? 0,
        master: p?.master ?? 0,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, onLevels]);

  useEffect(() => {
    if (!showViz) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const paint = (dt: number) => {
      const parent = canvas.parentElement;
      const cssW = parent?.clientWidth || canvas.clientWidth || 640;
      const cssH = parent?.clientHeight || canvas.clientHeight || 360;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const durationMs = Math.max(projectDurationMs(project), 10_000);
      const synthetic = featuresAt(project.playheadMs, durationMs);
      let live = null as ReturnType<PlaybackTap["sample"]> | null;
      try {
        live = tapRef.current?.sample(project.playheadMs) ?? null;
      } catch {
        live = null;
      }
      const features = preferLiveFeatures(live, synthetic);
      const sceneId = sceneAt(project, project.playheadMs) ?? project.visualizer.sceneId;
      renderVisualizerScene(ctx, canvas.width, canvas.height, sceneId, features, dt);
    };

    const dt = Math.max(0, (project.playheadMs - lastPlayheadRef.current) / 1000);
    lastPlayheadRef.current = project.playheadMs;
    paint(dt);

    const target = canvas.parentElement ?? canvas;
    const ro = new ResizeObserver(() => paint(0));
    ro.observe(target);
    return () => ro.disconnect();
  }, [showViz, project]);

  const activeLabel = formatResolvedSource(picture);

  return (
    <section className="preview-wrap" data-testid="preview">
      <div className="preview-chrome">
        <span>Preview</span>
        <span>{playing ? "Live" : "Paused"}</span>
      </div>
      <div className="preview-stage">
        {videoAsset?.objectUrl && videoClip ? (
          <>
            {isStill ? (
              <canvas
                ref={stillRef}
                data-testid="preview-still"
                style={{
                  width: "100%",
                  height: "100%",
                  opacity:
                    layerA *
                    videoAlphaAtClipTime(videoClip, project.playheadMs - videoClip.startMs),
                }}
              />
            ) : (
              <video
                ref={videoRef}
                src={videoAsset.objectUrl}
                muted
                playsInline
                data-testid="preview-video"
                style={{
                  opacity:
                    layerA *
                    videoAlphaAtClipTime(videoClip, project.playheadMs - videoClip.startMs),
                }}
              />
            )}
            {composite.plate && composite.plate.alpha > 0 ? (
              <div
                data-testid="preview-plate"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: composite.plate.color,
                  opacity: composite.plate.alpha,
                  pointerEvents: "none",
                }}
              />
            ) : null}
          </>
        ) : null}
        {showViz ? (
          <canvas
            ref={canvasRef}
            data-testid="visualizer-canvas"
            style={videoAsset?.objectUrl && videoClip ? { position: "absolute", inset: 0 } : undefined}
          />
        ) : !videoAsset?.objectUrl || !videoClip ? (
          <div className="preview-empty">
            {videoClip && videoAsset?.missing
              ? `missing:${videoAsset.name}`
              : "No video under playhead"}
          </div>
        ) : null}
      </div>
      <audio ref={v1Ref} className="hidden-audio" data-testid="preview-v1" />
      <audio ref={v2Ref} className="hidden-audio" data-testid="preview-v2" />
      <audio ref={a1Ref} className="hidden-audio" data-testid="preview-a1" />
      <audio ref={a2Ref} className="hidden-audio" data-testid="preview-a2" />
      <div className="preview-meta">
        Active: {activeLabel} · audio{" "}
        {TRACK_IDS.filter((id) => mixClips.some((c) => c.trackId === id)).join(" ") || "—"}
      </div>
    </section>
  );
}
