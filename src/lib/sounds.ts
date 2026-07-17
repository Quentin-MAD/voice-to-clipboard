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
 * Soft "thinking / loading" loop: two low sine notes gently pulsing.
 * Returns a stop function.
 */
export function playProcessingLoop(): () => void {
  const c = getCtx();
  if (!c) return () => {};

  const master = c.createGain();
  master.gain.value = 0.0;
  master.connect(c.destination);

  // Fade in
  const now = c.currentTime;
  master.gain.linearRampToValueAtTime(0.08, now + 0.15);

  // Two soft sine oscillators (pleasant interval)
  const osc1 = c.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 440; // A4
  const osc2 = c.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 587.33; // D5

  // LFO to gently modulate amplitude (breathing/pulse effect)
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 1.6; // ~1.6 pulses/sec
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.05;
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);

  osc1.connect(master);
  osc2.connect(master);

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
    master.gain.linearRampToValueAtTime(0, t + 0.15);
    setTimeout(() => {
      try {
        osc1.stop();
        osc2.stop();
        lfo.stop();
        osc1.disconnect();
        osc2.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        master.disconnect();
      } catch {
        // ignore
      }
    }, 200);
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
