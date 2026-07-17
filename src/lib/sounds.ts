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
 * Soft "thinking" loop — three gentle tonal blips that fade from louder to
 * softer, repeating while the AI is processing. Designed to be easy on the
 * ear even during long waits.
 * Returns a stop function.
 */
export function playProcessingLoop(): () => void {
  const c = getCtx();
  if (!c) return () => {};

  // Warm low-pass filter to remove any harsh edge
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.6;

  const master = c.createGain();
  master.gain.value = 0.85;
  filter.connect(master);
  master.connect(c.destination);

  // Three descending-softness notes: same friendly pitch set, but amplitude
  // falls from louder to softer so the pattern feels like it "breathes out".
  const notes = [
    { freq: 784.0, gain: 0.14 }, // G5
    { freq: 659.25, gain: 0.09 }, // E5
    { freq: 523.25, gain: 0.05 }, // C5
  ];
  let step = 0;
  let stopped = false;

  const blip = () => {
    if (stopped) return;
    const c2 = ctx;
    if (!c2) return;
    const t = c2.currentTime;
    const note = notes[step % notes.length];
    step++;

    const osc = c2.createOscillator();
    // Triangle is a bit fuller than sine, but still very soft through the filter
    osc.type = "triangle";
    osc.frequency.value = note.freq;

    const g = c2.createGain();
    g.gain.setValueAtTime(0, t);
    // Gentle attack and a slightly longer, rounded decay
    g.gain.linearRampToValueAtTime(note.gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(g);
    g.connect(filter);
    osc.start(t);
    osc.stop(t + 0.28);
    setTimeout(() => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        // ignore
      }
    }, 350);
  };

  // First blip immediately, then every ~280ms (slower, calmer cadence)
  blip();
  const interval = window.setInterval(blip, 280);

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
