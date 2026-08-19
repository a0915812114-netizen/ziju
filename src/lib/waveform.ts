export function syntheticPeaks(count = 1200) {
  const peaks = new Array<number>(count);
  for (let i = 0; i < count; i += 1) {
    const envelope = 0.22 + 0.78 * Math.abs(Math.sin(i / 16));
    const voiced = i % 51 < 34;
    const noise = voiced ? 0.45 + Math.random() * 0.55 : Math.random() * 0.12;
    peaks[i] = Math.min(1, envelope * noise);
  }
  return peaks;
}

export async function peaksFromMedia(url: string, barCount = 2400) {
  const response = await fetch(url);
  const bytes = await response.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    return computePeaks(buffer, barCount);
  } finally {
    await ctx.close();
  }
}

export function computePeaks(buffer: AudioBuffer, barCount: number) {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const samples = new Float32Array(length);
  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      samples[i] += (data[i] ?? 0) / channels;
    }
  }
  const step = Math.max(1, Math.floor(length / barCount));
  const peaks = new Array<number>(barCount);
  let max = 0.0001;
  for (let i = 0; i < barCount; i += 1) {
    const start = i * step;
    const end = Math.min(length, start + step);
    let peak = 0;
    for (let s = start; s < end; s += 1) {
      peak = Math.max(peak, Math.abs(samples[s] ?? 0));
    }
    peaks[i] = peak;
    max = Math.max(max, peak);
  }
  return peaks.map((value) => value / max);
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  viewStartMs: number,
  viewDurationMs: number,
  durationMs: number,
  color: string,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx || width === 0) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!peaks.length || durationMs <= 0) return;

  const mid = height / 2;
  const startRatio = viewStartMs / durationMs;
  const endRatio = (viewStartMs + viewDurationMs) / durationMs;
  const start = Math.max(0, Math.floor(startRatio * peaks.length));
  const end = Math.min(peaks.length, Math.ceil(endRatio * peaks.length));
  const visible = Math.max(1, end - start);
  const barWidth = width / visible;

  ctx.fillStyle = color;
  for (let i = 0; i < visible; i += 1) {
    const amp = peaks[start + i] ?? 0;
    const h = Math.max(1, amp * (height * 0.86));
    ctx.fillRect(i * barWidth, mid - h / 2, Math.max(0.6, barWidth * 0.85), h);
  }
}
