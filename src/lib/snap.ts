export function snapMs(value: number, targets: number[], thresholdMs: number) {
  let best = value;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const dist = Math.abs(target - value);
    if (dist < bestDist) {
      best = target;
      bestDist = dist;
    }
  }
  const snapped = bestDist <= thresholdMs;
  return { value: snapped ? best : value, snapped };
}

export function snapTargets(opts: {
  durationMs: number;
  marks: number[];
  cutPoints: number[];
  cues: Array<{ id: string; startMs: number; endMs: number }>;
  exceptId?: string;
  playheadMs?: number;
}) {
  const targets = [0, Math.max(0, opts.durationMs), ...opts.marks, ...opts.cutPoints];
  if (opts.playheadMs != null) targets.push(opts.playheadMs);
  for (const cue of opts.cues) {
    if (cue.id === opts.exceptId) continue;
    targets.push(cue.startMs, cue.endMs);
  }
  return targets;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
