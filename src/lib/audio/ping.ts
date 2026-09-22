"use client";

// Synthesized beeps (no audio asset needed) for order alerts. Runs entirely
// via the Web Audio API.

function beep(frequencyHz: number) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequencyHz;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    // Audio not available (e.g. autoplay policy) — silently skip.
  }
}

/** Shop dashboard: a new order just came in. */
export function playNewOrderPing() {
  beep(880);
}

/** Buyer side: one of their orders changed status. A lower, softer tone so
 *  it doesn't read as urgent the way the shop's "new order" ping does. */
export function playOrderUpdatePing() {
  beep(660);
}
