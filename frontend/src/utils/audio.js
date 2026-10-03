/** Âm báo SOS bằng Web Audio (không cần file âm thanh).
 *
 * Chrome / Edge chặn âm thanh tới khi người dùng bấm / gõ phím trên trang (chính sách tự phát): màn hình trực ban mở lại
 * (F5, tự khởi động, sau khi cập nhật phiên bản) mà chưa ai bấm thì chuông SOS im. `watchAudioUnlock` mở khoá ở lần bấm
 * đầu tiên; thanh trên báo "Bấm để bật chuông SOS" khi còn bị chặn (store.audioReady). */
let ctx;
const audioContext = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());

/** Đã có tương tác trên trang (âm thanh được phép) — trình duyệt cũ không có userActivation: coi như được. */
export const audioAllowed = () => {
  try {
    return navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  } catch {
    return true;
  }
};

/** Lần bấm / gõ phím đầu tiên trên trang → mở khoá âm thanh, gọi `onReady`. Trả hàm huỷ theo dõi. */
export function watchAudioUnlock(onReady) {
  const unlock = () => {
    try {
      const c = audioContext();
      if (c.state === 'suspended') c.resume();
    } catch { /* trình duyệt không hỗ trợ Web Audio */ }
    onReady();
    stop();
  };
  const stop = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  return stop;
}

export function playAlarm(level = 1) {
  try {
    ctx = audioContext();
    if (ctx.state === 'suspended') ctx.resume();
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
