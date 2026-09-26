/** Âm báo SOS bằng Web Audio (không cần file âm thanh). */
let ctx;
export function playAlarm(level = 1) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const beeps = level === 1 ? 3 : 2;
    for (let i = 0; i < beeps; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = level === 1 ? 880 : 660;
      const t0 = ctx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.22);
    }
  } catch { /* trình duyệt chặn âm thanh khi chưa tương tác */ }
}
