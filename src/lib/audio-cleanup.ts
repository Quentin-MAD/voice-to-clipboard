// Client-side noise reduction: runs entirely on-device before the WAV is encoded.
// Two stages: a real-time Web Audio filter chain, and an offline gate/normalizer.

export type DenoiseLevel = "light" | "normal" | "strong";

export const DENOISE_LEVELS: Array<{ value: DenoiseLevel; label: string; hint: string }> = [
  { value: "light", label: "Léger", hint: "Environnement calme" },
  { value: "normal", label: "Normal", hint: "Recommandé" },
  { value: "strong", label: "Fort", hint: "Rue, ventilateur" },
];

type Profile = {
  highpass: number;
  lowpass: number;
  presenceGain: number;
  /** Noise floor multiplier for the gate threshold. */
  thresholdFactor: number;
  /** Residual gain applied to frames considered noise (0 = full mute). */
  floorGain: number;
};

const PROFILES: Record<DenoiseLevel, Profile> = {
  light: { highpass: 70, lowpass: 8000, presenceGain: 1.5, thresholdFactor: 1.8, floorGain: 0.35 },
  normal: { highpass: 85, lowpass: 7500, presenceGain: 3, thresholdFactor: 2.6, floorGain: 0.18 },
  strong: { highpass: 110, lowpass: 7000, presenceGain: 4.5, thresholdFactor: 3.6, floorGain: 0.06 },
};

export const DENOISE_STORAGE_KEY = "talking-denoise";

export type DenoiseSettings = { enabled: boolean; level: DenoiseLevel };

export const DEFAULT_DENOISE: DenoiseSettings = { enabled: true, level: "normal" };

export function loadDenoiseSettings(): DenoiseSettings {
  if (typeof localStorage === "undefined") return DEFAULT_DENOISE;
  try {
    const raw = localStorage.getItem(DENOISE_STORAGE_KEY);
    if (!raw) return DEFAULT_DENOISE;
    const parsed = JSON.parse(raw) as Partial<DenoiseSettings>;
    const level = parsed.level;
    return {
      enabled: parsed.enabled !== false,
      level: level === "light" || level === "normal" || level === "strong" ? level : "normal",
    };
  } catch {
    return DEFAULT_DENOISE;
  }
}

export function saveDenoiseSettings(settings: DenoiseSettings) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DENOISE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/**
 * Inserts a speech-focused filter chain between `source` and the returned node.
 * Connect the returned node to the recording ScriptProcessor.
 */
export function buildDenoiseChain(
  ctx: BaseAudioContext,
  source: AudioNode,
  settings: DenoiseSettings,
): AudioNode {
  if (!settings.enabled) return source;
  const p = PROFILES[settings.level];

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = p.highpass;
  hp.Q.value = 0.7;

  const hp2 = ctx.createBiquadFilter();
  hp2.type = "highpass";
  hp2.frequency.value = p.highpass;
  hp2.Q.value = 0.7;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(p.lowpass, ctx.sampleRate / 2 - 100);
  lp.Q.value = 0.7;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3000;
  presence.Q.value = 0.9;
  presence.gain.value = p.presenceGain;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -28;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;

  source.connect(hp);
  hp.connect(hp2);
  hp2.connect(lp);
  lp.connect(presence);
  presence.connect(comp);
  return comp;
}

function flatten(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * Offline cleanup: adaptive noise gate, silence trimming and peak normalization.
 * Falls back to the untouched audio whenever the result would be degraded.
 */
export function cleanupPcm(
  chunks: Float32Array[],
  sampleRate: number,
  settings: DenoiseSettings,
): Float32Array[] {
  if (!settings.enabled || chunks.length === 0) return chunks;
  const p = PROFILES[settings.level];
  const input = flatten(chunks);
  if (input.length < sampleRate * 0.2) return chunks;

  const frame = Math.max(64, Math.round(sampleRate * 0.02)); // ~20 ms
  const frameCount = Math.floor(input.length / frame);
  if (frameCount < 4) return chunks;

  const rms = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    const start = f * frame;
    for (let i = start; i < start + frame; i++) sum += input[i] * input[i];
    rms[f] = Math.sqrt(sum / frame);
  }

  // Noise floor = 20th percentile of frame energy (robust to continuous noise).
  const sorted = Float32Array.from(rms).sort();
  const noiseFloor = Math.max(sorted[Math.floor(frameCount * 0.2)], 1e-5);
  const peakRms = sorted[frameCount - 1];
  const threshold = Math.max(noiseFloor * p.thresholdFactor, peakRms * 0.06);

  const voiced = new Uint8Array(frameCount);
  let voicedCount = 0;
  for (let f = 0; f < frameCount; f++) {
    if (rms[f] >= threshold) {
      voiced[f] = 1;
      voicedCount++;
    }
  }
  if (voicedCount === 0) return chunks;

  // Hold: keep 5 frames (~100 ms) around voiced frames so word tails survive.
  const hold = 5;
  const kept = new Uint8Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    if (!voiced[f]) continue;
    for (let k = Math.max(0, f - hold); k <= Math.min(frameCount - 1, f + hold); k++) kept[k] = 1;
  }

  // Per-sample gain with attack/release smoothing.
  const out = new Float32Array(input.length);
  const attack = Math.max(1, Math.round(sampleRate * 0.01));
  const release = Math.max(1, Math.round(sampleRate * 0.12));
  const attackCoef = 1 / attack;
  const releaseCoef = 1 / release;
  let gain = kept[0] ? 1 : p.floorGain;
  for (let i = 0; i < input.length; i++) {
    const f = Math.min(frameCount - 1, Math.floor(i / frame));
    const target = kept[f] ? 1 : p.floorGain;
    gain += target > gain ? Math.min(attackCoef, target - gain) : -Math.min(releaseCoef, gain - target);
    out[i] = input[i] * gain;
  }

  // Trim leading / trailing silence, leaving ~150 ms of padding.
  let firstFrame = 0;
  while (firstFrame < frameCount && !kept[firstFrame]) firstFrame++;
  let lastFrame = frameCount - 1;
  while (lastFrame > firstFrame && !kept[lastFrame]) lastFrame--;
  const pad = Math.round(sampleRate * 0.15);
  const start = Math.max(0, firstFrame * frame - pad);
  const end = Math.min(out.length, (lastFrame + 1) * frame + pad);
  const trimmed = end - start > sampleRate * 0.15 ? out.subarray(start, end) : out;

  // Peak normalization to ~-1 dBFS.
  let peak = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const a = Math.abs(trimmed[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-4) return chunks;
  const norm = Math.min(0.89 / peak, 8);
  const result = new Float32Array(trimmed.length);
  for (let i = 0; i < trimmed.length; i++) {
    const v = trimmed[i] * norm;
    result[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return [result];
}
