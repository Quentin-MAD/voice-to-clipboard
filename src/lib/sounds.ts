// Soft UI sounds synthesized via Web Audio API (no external assets).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Soft "thinking / loading" loop: warm low sine pad with a very slow, gentle breathing pulse.
 * Returns a stop function.
 */
export function playProcessingLoop(): () => void {
  const c = getCtx();
  if (!c) return () => {};

  const now = c.currentTime;

  // Master gain — very quiet, slow fade-in
  const master = c.createGain();
  master.gain.value = 0.0;
  master.gain.linearRampToValueAtTime(0.025, now + 0.6);

  // Gentle low-pass to remove any harshness
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.3;
  filter.connect(master);
  master.connect(c.destination);

  // Two soft low sine oscillators forming a warm perfect fifth
  const osc1 = c.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 220; // A3
  const osc2 = c.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 329.63; // E4 (perfect fifth, very consonant)

  osc1.connect(filter);
  osc2.connect(filter);

  // Very slow LFO for a soft breathing effect
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.35; // ~1 breath every ~3s
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);

  osc1.start();
  osc2.start();
  lfo.start();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const c2 = ctx;
    if (!c2) return;
    const t = c2.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.3);
    setTimeout(() => {
      try {
        osc1.stop();
        osc2.stop();
        lfo.stop();
        osc1.disconnect();
        osc2.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        filter.disconnect();
        master.disconnect();
      } catch {
        // ignore
      }
    }, 350);
  };
}

/**
 * Soft "success / validation" chime: two-note ascending arpeggio.
 */
export function playSuccessChime() {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;

  const notes = [
    { freq: 783.99, start: 0, dur: 0.18 },   // G5
    { freq: 1046.5, start: 0.09, dur: 0.28 }, // C6
  ];

  for (const n of notes) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = n.freq;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, now + n.start);
    g.gain.linearRampToValueAtTime(0.15, now + n.start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.dur + 0.05);
  }
}
