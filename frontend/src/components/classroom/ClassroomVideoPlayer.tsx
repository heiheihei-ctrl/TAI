import React from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

type Props = {
  src: string;
  trialSeconds?: number | null;
  purchased?: boolean;
  hasNext?: boolean;
  onNext?: () => void;
  onTrialEnded?: () => void;
};

function formatSeconds(total: number) {
  const s = Math.max(0, Math.floor(total || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export default function ClassroomVideoPlayer({
  src,
  trialSeconds,
  purchased = false,
  hasNext = false,
  onNext,
  onTrialEnded,
}: Props) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [speed, setSpeed] = React.useState(1);
  const [speedOpen, setSpeedOpen] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const hideTimerRef = React.useRef<number | null>(null);
  const trialEndedRef = React.useRef(false);

  const trialLimit =
    !purchased && trialSeconds != null && trialSeconds > 0 ? trialSeconds : null;
  const effectiveDuration = trialLimit
    ? Math.min(duration || trialLimit, trialLimit)
    : duration;

  const clearHideTimer = () => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const bumpControls = React.useCallback(() => {
    setControlsVisible(true);
    clearHideTimer();
    if (playing) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
        setSpeedOpen(false);
      }, 2500);
    }
  }, [playing]);

  React.useEffect(() => {
    trialEndedRef.current = false;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSpeed(1);
    setSpeedOpen(false);
  }, [src]);

  React.useEffect(() => {
    bumpControls();
    return clearHideTimer;
  }, [bumpControls, playing]);

  React.useEffect(() => {
    const onFsChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
        setPlaying(true);
      } catch {
        // ignore autoplay block
      }
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const seekTo = (next: number) => {
    const video = videoRef.current;
    if (!video) return;
    const capped = trialLimit != null ? Math.min(next, trialLimit) : next;
    video.currentTime = Math.max(0, Math.min(capped, video.duration || capped));
    setCurrentTime(video.currentTime);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const changeVolume = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(1, v));
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(video.muted);
  };

  const changeSpeed = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = v;
    setSpeed(v);
    setSpeedOpen(false);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  const progress = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="group relative aspect-video w-full overflow-hidden rounded-md bg-black select-none"
      onMouseMove={bumpControls}
      onMouseLeave={() => {
        if (playing) {
          setControlsVisible(false);
          setSpeedOpen(false);
        }
      }}
      onDoubleClick={() => void toggleFullscreen()}
    >
      <video
        key={src}
        ref={videoRef}
        className="h-full w-full object-contain"
        src={src}
        playsInline
        onClick={() => void togglePlay()}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          const video = e.currentTarget;
          setCurrentTime(video.currentTime);
          if (trialLimit != null && video.currentTime >= trialLimit) {
            video.pause();
            video.currentTime = trialLimit;
            setCurrentTime(trialLimit);
            if (!trialEndedRef.current) {
              trialEndedRef.current = true;
              onTrialEnded?.();
            }
          }
        }}
        onEnded={() => {
          setPlaying(false);
          if (hasNext) onNext?.();
        }}
      />

      {trialLimit != null ? (
        <div className="pointer-events-none absolute bottom-16 left-3 z-10 rounded bg-black/70 px-2 py-1 text-xs text-white/90 sm:left-4">
          可试看前 {formatSeconds(trialLimit)}，购买后可收看完整内容
        </div>
      ) : null}

      {/* 中央大播放按钮（暂停时） */}
      {!playing ? (
        <button
          type="button"
          className="absolute inset-0 z-[5] flex items-center justify-center bg-black/20"
          onClick={() => void togglePlay()}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg">
            <Play className="ml-0.5 h-7 w-7 fill-current" />
          </span>
        </button>
      ) : null}

      {/* 底部控制条 */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-10 transition-opacity ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* 进度条 */}
        <div
          className="mb-2 h-1.5 cursor-pointer rounded-full bg-white/25"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            seekTo(ratio * (effectiveDuration || 0));
          }}
        >
          <div
            className="relative h-full rounded-full bg-[#3b82f6]"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          >
            <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-white">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className="rounded p-1.5 hover:bg-white/15"
              onClick={() => void togglePlay()}
              title={playing ? "暂停" : "播放"}
            >
              {playing ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </button>
            <button
              type="button"
              className="rounded p-1.5 hover:bg-white/15 disabled:opacity-40"
              disabled={!hasNext}
              onClick={() => onNext?.()}
              title="下一集"
            >
              <SkipForward className="h-5 w-5 fill-current" />
            </button>
            <span className="ml-1 text-xs text-white/85 tabular-nums sm:text-sm">
              {formatSeconds(currentTime)} / {formatSeconds(effectiveDuration)}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <div className="relative">
              <button
                type="button"
                className="rounded px-2 py-1 text-xs hover:bg-white/15 sm:text-sm"
                onClick={() => setSpeedOpen((v) => !v)}
              >
                {speed === 1 ? "倍速" : `${speed}x`}
              </button>
              {speedOpen ? (
                <div className="absolute bottom-full right-0 mb-1 min-w-[72px] overflow-hidden rounded bg-black/90 py-1 text-xs shadow-lg">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`block w-full px-3 py-1.5 text-left hover:bg-white/15 ${
                        speed === s ? "text-blue-400" : "text-white"
                      }`}
                      onClick={() => changeSpeed(s)}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="rounded p-1.5 hover:bg-white/15"
              onClick={toggleMute}
              title={muted ? "取消静音" : "静音"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="hidden w-16 accent-blue-500 sm:block"
            />
            <button
              type="button"
              className="rounded p-1.5 hover:bg-white/15"
              onClick={() => void toggleFullscreen()}
              title={fullscreen ? "退出全屏" : "全屏"}
            >
              {fullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
