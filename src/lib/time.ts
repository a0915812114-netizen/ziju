export function pad(n: number, width = 2) {
  return String(n).padStart(width, "0");
}

export function formatSrtTime(ms: number) {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

export function formatVttTime(ms: number) {
  return formatSrtTime(ms).replace(",", ".");
}

export function formatPlayerTime(ms: number, withMillis = false) {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  if (!withMillis) return `${minutes}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}.${pad(clamped % 1000, 3)}`;
}

export function formatClock(ms: number) {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${pad(minutes)}:${pad(seconds)}.${tenths}`;
}

export function formatListTime(ms: number) {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${pad(seconds)}`;
}

export function formatPrecise(ms: number) {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

export function secondsToMs(sec: number) {
  return Math.round(sec * 1000);
}
