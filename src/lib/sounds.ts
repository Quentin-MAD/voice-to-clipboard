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
 * Soft "typing / thinking" loop — inspired by Snapchat's typing indicator:
 * a rhythmic sequence of tiny soft blips at ~5 Hz.
 * Returns a stop function.
 */
export function playProcessingLoop(): () => void {
  const c = getCtx();
  if (!c) return () => {};

  // Shared soft low-pass filter to keep every blip warm (no harshness)
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  filter.Q.value = 0.5;

  const master = c.createGain();
  master.gain.value = 0.9;
  filter.connect(master);
  master.connect(c.destination);

  // Two alternating pitches for a subtle "tick-tock" typing feel
  const pitches = [880, 988]; // A5, B5 — small step, very soft
  let step = 0;
  let stopped = false;

  const blip = () => {
    if (stopped) return;
    const c2 = ctx;
    if (!c2) return;
    const t = c2.currentTime;
    const freq = pitches[step % pitches.length];
    step++;

    const osc = c2.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const g = c2.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.008); // quick soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11); // short decay

    osc.connect(g);
    g.connect(filter);
    osc.start(t);
    osc.stop(t + 0.14);
    setTimeout(() => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        // ignore
      }
    }, 200);
  };

  // First blip immediately, then every ~180ms (~5.5 Hz — typing cadence)
  blip();
  const interval = window.setInterval(blip, 180);

  return () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(interval);
    setTimeout(() => {
      try {
        filter.disconnect();
        master.disconnect();
      } catch {
        // ignore
      }
    }, 250);
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
