"use client";

import { drawSubtitleFrame } from "./draw-subtitle";
import type { Cue } from "./types";
import type { SubtitleStyle } from "./style";

export type BurnMode = "burn" | "subs";

type BurnOptions = {
  mediaUrl: string;
  cues: Cue[];
  style: SubtitleStyle;
  mode: BurnMode;
  signal?: AbortSignal;
  onProgress: (progress: number, message: string) => void;
};

function pickMime() {
  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function waitMeta(video: HTMLVideoElement) {
  if (video.readyState >= 1 && video.videoWidth) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("讀不到影片畫面"));
    }, 12000);
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("影片無法用來燒字幕"));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("loadedmetadata", ok, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.load();
  });
}

function videoCaptureStream(video: HTMLVideoElement) {
  const capture = (
    video as HTMLVideoElement & { captureStream?: (fps?: number) => MediaStream }
  ).captureStream;
  if (!capture) throw new Error("這個瀏覽器不能擷取影片音軌，請改用 Chrome 或 Edge");
  return capture.call(video);
}

function attachAudio(video: HTMLVideoElement, destStream: MediaStream) {
  video.muted = false;
  video.volume = 0;
  try {
    const captured = videoCaptureStream(video);
    for (const track of captured.getVideoTracks()) track.stop();
    for (const track of captured.getAudioTracks()) destStream.addTrack(track);
  } catch {
    /* 沒聲音仍可出畫面 */
  }
}

export async function exportBurnedVideo(opts: BurnOptions) {
  const mime = pickMime();
  if (!mime) throw new Error("這個瀏覽器不能在網頁裡燒字幕，請改用 Chrome 或 Edge");

  const video = document.createElement("video");
  video.src = opts.mediaUrl;
  video.playsInline = true;
  video.muted = true;
  video.playbackRate = 1;
  video.preload = "auto";
  video.style.position = "fixed";
  video.style.left = "-9999px";
  document.body.appendChild(video);

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.left = "-9999px";
  document.body.appendChild(canvas);

  let canvasStream: MediaStream | null = null;

  try {
    await waitMeta(video);
    if (!video.videoWidth) throw new Error("音檔沒有畫面，無法燒成品影片。請先接回影片。");

    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(2, Math.round(video.videoWidth * scale) & ~1);
    const height = Math.max(2, Math.round(video.videoHeight * scale) & ~1);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("無法建立畫布");

    const stream = canvas.captureStream(30);
    canvasStream = stream;

    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 4_000_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      recorder.onerror = () => reject(new Error("燒錄中斷"));
    });

    const draw = () => {
      if (opts.mode === "subs") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.drawImage(video, 0, 0, width, height);
      }
      drawSubtitleFrame(ctx, width, height, opts.cues, video.currentTime * 1000, opts.style);
    };

    opts.onProgress(0.01, "開始燒字幕…");
    try {
      await video.play();
    } catch {
      throw new Error("瀏覽器擋住播放，請點一下頁面後再匯出");
    }
    if (opts.mode === "burn") attachAudio(video, stream);
    draw();
    recorder.start(400);

    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        draw();
        if (recorder.state !== "inactive") recorder.stop();
        resolve();
      };
      const fail = (error: Error) => {
        if (done) return;
        done = true;
        try {
          video.pause();
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          /* ignore */
        }
        reject(error);
      };
      const tick = () => {
        if (opts.signal?.aborted) {
          fail(new DOMException("已取消", "AbortError"));
          return;
        }
        draw();
        const duration = video.duration || 1;
        opts.onProgress(Math.min(0.99, video.currentTime / duration), "正在燒字幕…");
        if (video.ended || video.currentTime >= duration - 0.04) {
          finish();
          return;
        }
        schedule(tick);
      };
      video.onended = finish;
      const schedule = (cb: () => void) => {
        if ("requestVideoFrameCallback" in video) {
          video.requestVideoFrameCallback(() => cb());
        } else {
          requestAnimationFrame(cb);
        }
      };
      schedule(tick);
    });

    const blob = await stopped;
    if (opts.signal?.aborted) throw new DOMException("已取消", "AbortError");
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    return { blob, ext };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    canvas.remove();
    canvasStream?.getTracks().forEach((track) => track.stop());
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, content: string, type: string) {
  downloadBlob(new Blob([content], { type }), filename);
}
