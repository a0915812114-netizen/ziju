function waitSeeked(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, 450);
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("切點偵測讀取影格失敗"));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function frameScore(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  const pixels = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    sum +=
      Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
      Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
      Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
  }
  return sum / pixels / 3;
}

function mergeClose(times: number[], gapMs: number) {
  if (times.length === 0) return times;
  const sorted = [...times].sort((a, b) => a - b);
  const out: number[] = [sorted[0] ?? 0];
  for (const time of sorted.slice(1)) {
    if (time - (out[out.length - 1] ?? 0) >= gapMs) out.push(time);
  }
  return out;
}

export async function detectSceneCuts(
  url: string,
  durationMs: number,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
) {
  if (durationMs < 400) return [];
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("這份檔案沒有可分析的畫面"));
  });
  if (!video.videoWidth) {
    video.removeAttribute("src");
    video.load();
    throw new Error("音檔沒有畫面切點，請改上傳影片");
  }

  const width = 96;
  const height = 54;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("無法建立畫布");

  const maxSamples = 2200;
  const step = Math.max(90, durationMs / maxSamples);
  const scores: number[] = [];
  const times: number[] = [];
  let prev: Uint8ClampedArray | null = null;

  for (let t = 0; t < durationMs; t += step) {
    if (signal?.aborted) break;
    video.currentTime = t / 1000;
    await waitSeeked(video);
    ctx.drawImage(video, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height).data;
    if (prev) {
      scores.push(frameScore(prev, frame));
      times.push(Math.round(t));
    }
    prev = new Uint8ClampedArray(frame);
    onProgress(Math.min(1, t / durationMs));
  }

  video.removeAttribute("src");
  video.load();

  const mean = scores.reduce((sum, n) => sum + n, 0) / Math.max(scores.length, 1);
  const variance =
    scores.reduce((sum, n) => sum + (n - mean) ** 2, 0) / Math.max(scores.length, 1);
  const threshold = Math.max(18, mean + Math.sqrt(variance) * 2.2);
  const cuts: number[] = [];
  for (let i = 0; i < scores.length; i += 1) {
    const score = scores[i] ?? 0;
    const prevScore = scores[i - 1] ?? 0;
    const nextScore = scores[i + 1] ?? 0;
    if (score >= threshold && score >= prevScore && score >= nextScore) {
      cuts.push(times[i] ?? 0);
    }
  }
  return mergeClose(cuts, 280);
}

export const DEMO_CUT_POINTS = [4800, 11000];
