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

  // Very gentle low-pass filter to keep the tones warm and remove any
  // sharp edge that could stand out while gaming.
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 650;
  filter.Q.value = 0.3;

  const master = c.createGain();
  master.gain.value = 0.7;
  filter.connect(master);
  master.connect(c.destination);

  // Three descending notes: slightly lower and much quieter than before.
  // The volume drops from louder to softer so the pattern feels like it
  // "breathes out".
  const notes = [
    { freq: 698.46, gain: 0.075 }, // F5
    { freq: 587.33, gain: 0.05 },  // D5
    { freq: 493.88, gain: 0.03 },  // B4
  ];
  let step = 0;
  let stopped = false;
  let nextTimer: number | null = null;

  const blip = () => {
    if (stopped) return;
    const c2 = ctx;
    if (!c2) return;
    const t = c2.currentTime;
    const note = notes[step % notes.length];
    step++;

    const osc = c2.createOscillator();
    // Pure sine wave is the softest source; the low-pass finishes rounding it.
    osc.type = "sine";
    osc.frequency.value = note.freq;

    const g = c2.createGain();
    g.gain.setValueAtTime(0, t);
    // Soft attack and a long, rounded decay so nothing feels percussive.
    g.gain.linearRampToValueAtTime(note.gain, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

    osc.connect(g);
    g.connect(filter);
    osc.start(t);
    osc.stop(t + 0.38);

    setTimeout(() => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        // ignore
      }
    }, 450);

    // Schedule the next blip. The gap widens through the cycle:
    // short pause between 1st and 2nd, shorter still between 2nd and 3rd,
    // then a longer pause before the cycle starts again so the pattern
    // feels like a gentle inhale / exhale.
    const cycleIndex = (step - 1) % notes.length;
    let delay: number;
    if (cycleIndex === 0) delay = 340;   // 1st -> 2nd
    else if (cycleIndex === 1) delay = 220; // 2nd -> 3rd (shorter)
    else delay = 760;                    // 3rd -> 1st of next cycle (longer)
    nextTimer = window.setTimeout(blip, delay);
  };

  blip();

  return () => {
    if (stopped) return;
    stopped = true;
    if (nextTimer !== null) window.clearTimeout(nextTimer);
    setTimeout(() => {
      try {
        filter.disconnect();
        master.disconnect();
      } catch {
        // ignore
      }
    }, 450);
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
