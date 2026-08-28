import { useEffect, useRef } from "react";
import {
  audioClipsAt,
  kindOfTrack,
  sourceTimeAt,
  topVideoClipAt,
  type Project,
} from "../../core/models";

interface Props {
  project: Project;
  playing: boolean;
}

export function Preview({ project, playing }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const a1Ref = useRef<HTMLAudioElement>(null);
  const a2Ref = useRef<HTMLAudioElement>(null);

  const videoClip = topVideoClipAt(project, project.playheadMs);
  const videoAsset = videoClip
    ? project.assets.find((a) => a.id === videoClip.assetId)
    : undefined;
  const audios = audioClipsAt(project, project.playheadMs);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoClip || !videoAsset?.objectUrl) return;
    const want = sourceTimeAt(videoClip, project.playheadMs) / 1000;
    if (Math.abs(video.currentTime - want) > 0.08) {
      video.currentTime = want;
    }
    if (playing && video.paused) void video.play().catch(() => undefined);
    if (!playing && !video.paused) video.pause();
  }, [project.playheadMs, playing, videoClip, videoAsset?.objectUrl]);

  useEffect(() => {
    const bind = (el: HTMLAudioElement | null, trackId: "A1" | "A2") => {
      if (!el) return;
      const clip = audios.find((c) => c.trackId === trackId);
      const asset = clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
      if (!clip || !asset?.objectUrl) {
        el.pause();
        el.removeAttribute("src");
        return;
      }
      if (el.src !== asset.objectUrl) el.src = asset.objectUrl;
      el.volume = Math.max(0, Math.min(1, clip.gain));
      const want = sourceTimeAt(clip, project.playheadMs) / 1000;
      if (Math.abs(el.currentTime - want) > 0.08) el.currentTime = want;
      if (playing && el.paused) void el.play().catch(() => undefined);
      if (!playing && !el.paused) el.pause();
    };
    bind(a1Ref.current, "A1");
    bind(a2Ref.current, "A2");
  }, [audios, playing, project.assets, project.playheadMs]);

  return (
    <section className="preview-wrap" data-testid="preview">
      <div className="preview-stage">
        {videoAsset?.objectUrl && videoClip ? (
          <video
            ref={videoRef}
            src={videoAsset.objectUrl}
            muted
            playsInline
            data-testid="preview-video"
          />
        ) : (
          <div className="preview-empty">
            {videoClip && videoAsset?.missing
              ? `missing:${videoAsset.name}`
              : "No video under playhead"}
          </div>
        )}
      </div>
      <audio ref={a1Ref} className="hidden-audio" data-testid="preview-a1" />
      <audio ref={a2Ref} className="hidden-audio" data-testid="preview-a2" />
      <div style={{ padding: 8, fontSize: 12, color: "var(--muted)" }}>
        Active: {videoClip ? videoClip.trackId : "—"} · audio{" "}
        {audios.filter((c) => kindOfTrack(c.trackId) === "audio").map((c) => c.trackId).join(" ") || "—"}
      </div>
    </section>
  );
}
