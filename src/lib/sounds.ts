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
 * Soft "thinking / loading" loop: a gentle undulating tone with slow pitch
 * and filter modulation — like a calm wave rolling in and out.
 * Returns a stop function.
 */
export function playProcessingLoop(): () => void {
  const c = getCtx();
  if (!c) return () => {};

  const now = c.currentTime;

  // Master gain — quiet, slow fade-in
  const master = c.createGain();
  master.gain.value = 0.0;
  master.gain.linearRampToValueAtTime(0.04, now + 0.5);
  master.connect(c.destination);

  // Soft low-pass filter that will be modulated (wah-like undulation)
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  filter.Q.value = 2;
  filter.connect(master);

  // Triangle carrier — soft but a bit richer than pure sine
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 261.63; // C4

  // Slow LFO 1: pitch wobble (very subtle)
  const pitchLfo = c.createOscillator();
  pitchLfo.type = "sine";
  pitchLfo.frequency.value = 0.4; // ~2.5s per cycle
  const pitchLfoGain = c.createGain();
  pitchLfoGain.gain.value = 4; // ±4 Hz — very gentle vibrato
  pitchLfo.connect(pitchLfoGain);
  pitchLfoGain.connect(osc.frequency);

  // Slow LFO 2: filter sweep for the "undulating" wave feel
  const filterLfo = c.createOscillator();
  filterLfo.type = "sine";
  filterLfo.frequency.value = 0.5; // ~2s per cycle
  const filterLfoGain = c.createGain();
  filterLfoGain.gain.value = 350; // sweeps between ~250Hz and ~950Hz
  filterLfo.connect(filterLfoGain);
  filterLfoGain.connect(filter.frequency);

  osc.connect(filter);

  osc.start();
  pitchLfo.start();
  filterLfo.start();

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
        osc.stop();
        pitchLfo.stop();
        filterLfo.stop();
        osc.disconnect();
        pitchLfo.disconnect();
        pitchLfoGain.disconnect();
        filterLfo.disconnect();
        filterLfoGain.disconnect();
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
