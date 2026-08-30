import { useEffect, useRef } from "react";
import {
  TRACK_IDS,
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
import { mixLinearGain } from "../../core/volume";
import type { MixPeaks } from "../mixer/Mixer";
import {
  featuresAt,
  renderVisualizerScene,
  shouldShowVisualizer,
} from "../../core/visualizer";
import { createPlaybackTap, preferLiveFeatures, type PlaybackTap } from "../../core/visualz/playback-tap";

interface Props {
  project: Project;
  playing: boolean;
  onLevels?: (peaks: MixPeaks) => void;
}

export function Preview({ project, playing, onLevels }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const v1Ref = useRef<HTMLAudioElement>(null);
  const v2Ref = useRef<HTMLAudioElement>(null);
  const a1Ref = useRef<HTMLAudioElement>(null);
  const a2Ref = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPlayheadRef = useRef(project.playheadMs);
  const tapRef = useRef<PlaybackTap | null>(null);

  const videoClip = topVideoClipAt(project, project.playheadMs);
  const videoAsset = videoClip
    ? project.assets.find((a) => a.id === videoClip.assetId)
    : undefined;
  const mixClips = mixClipsAt(project, project.playheadMs);
  const showViz = shouldShowVisualizer(project, project.playheadMs);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoClip || !videoAsset?.objectUrl) return;
    const want = sourceTimeAt(videoClip, project.playheadMs) / 1000;
    if (Math.abs(video.currentTime - want) > 0.08) {
      video.currentTime = want;
    }
    video.playbackRate = videoClip.rate > 0 ? videoClip.rate : 1;
    if (playing && video.paused) void video.play().catch(() => undefined);
    if (!playing && !video.paused) video.pause();
  }, [project.playheadMs, playing, videoClip, videoAsset?.objectUrl]);

  useEffect(() => {
    const bind = (el: HTMLAudioElement | null, trackId: TrackId) => {
      if (!el) return;
      const clip = isTrackAudible(project, trackId)
        ? clipOnTrackAt(project, trackId, project.playheadMs)
        : undefined;
      const asset = clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
      if (clip && !vClipMixesOwnAudio(project, clip)) {
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
      const mix = mixLinearGain(
        gainAtClipTime(clip, project.playheadMs - clip.startMs),
        trackVolumeOf(project, trackId),
        project.masterVolume ?? 1,
        !isTrackAudible(project, trackId),
      );
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
      if (!clip || !vClipMixesOwnAudio(project, clip)) return 0;
      return mixLinearGain(
        gainAtClipTime(clip, project.playheadMs - clip.startMs),
        trackVolumeOf(project, trackId),
        1,
        false,
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
      renderVisualizerScene(ctx, canvas.width, canvas.height, project.visualizer.sceneId, features, dt);
    };

    const dt = Math.max(0, (project.playheadMs - lastPlayheadRef.current) / 1000);
    lastPlayheadRef.current = project.playheadMs;
    paint(dt);

    const target = canvas.parentElement ?? canvas;
    const ro = new ResizeObserver(() => paint(0));
    ro.observe(target);
    return () => ro.disconnect();
  }, [showViz, project]);

  const activeLabel = videoClip
    ? videoClip.trackId
    : showViz
      ? "VIS"
      : "—";

  return (
    <section className="preview-wrap" data-testid="preview">
      <div className="preview-chrome">
        <span>Preview</span>
        <span>{playing ? "Live" : "Paused"}</span>
      </div>
      <div className="preview-stage">
        {videoAsset?.objectUrl && videoClip ? (
          <video
            ref={videoRef}
            src={videoAsset.objectUrl}
            muted
            playsInline
            data-testid="preview-video"
            style={{
              opacity: videoAlphaAtClipTime(videoClip, project.playheadMs - videoClip.startMs),
            }}
          />
        ) : showViz ? (
          <canvas ref={canvasRef} data-testid="visualizer-canvas" />
        ) : (
          <div className="preview-empty">
            {videoClip && videoAsset?.missing
              ? `missing:${videoAsset.name}`
              : "No video under playhead"}
          </div>
        )}
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
