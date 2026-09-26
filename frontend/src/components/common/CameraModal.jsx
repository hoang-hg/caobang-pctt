import { useEffect, useRef } from 'react';
import { Modal } from './ui';

/** Luồng CCTV mô phỏng (vẽ canvas). Khi tích hợp thật: thay bằng <video> HLS/WebRTC từ stream_url. */
export default function CameraModal({ camera, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!camera) return undefined;
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    let raf;
    let t = 0;
    const draw = () => {
      t += 1;
      const w = cv.width;
      const h = cv.height;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#3b4a55');
      g.addColorStop(0.45, '#56636b');
      g.addColorStop(0.46, '#6b5a3e');
      g.addColorStop(1, '#4a3c28');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // dòng nước đục chảy xiết
      for (let i = 0; i < 70; i++) {
        const y = h * 0.5 + ((i * 37) % (h * 0.5));
        const x = (i * 97 + t * (4 + (i % 5))) % (w + 120) - 60;
        ctx.strokeStyle = `rgba(210,190,150,${0.15 + (i % 4) * 0.08})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 30, y - 4, x + 60, y);
        ctx.stroke();
      }
      // mưa
      ctx.strokeStyle = 'rgba(220,230,240,0.35)';
      for (let i = 0; i < 120; i++) {
        const x = (i * 53 + t * 3) % w;
        const y = (i * 71 + t * 14) % h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 10);
        ctx.stroke();
      }
      // nhiễu hạt
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (let i = 0; i < 300; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${camera.id}  ${new Date().toLocaleString('vi-VN')}`, 12, 22);
      ctx.fillStyle = t % 60 < 30 ? '#ef4444' : 'transparent';
      ctx.beginPath();
      ctx.arc(w - 60, 17, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('LIVE', w - 48, 22);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [camera]);

  if (!camera) return null;
  return (
    <Modal open wide onClose={onClose} title={`Camera trực tiếp – ${camera.name}`}>
      <canvas ref={ref} width={960} height={540} className="w-full rounded-lg bg-black" />
      <p className="mt-2 text-xs text-muted">
        Hình ảnh mô phỏng. Nguồn thật: {camera.stream_url} (RTSP → HLS/WebRTC qua media server).
      </p>
    </Modal>
  );
}
