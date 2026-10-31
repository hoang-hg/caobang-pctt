import { DEMO_TOKEN, stashRealAuth, useStore } from '../app/store';

/**
 * Bật / tắt CHẾ ĐỘ GIẢ LẬP trên trình duyệt này (nút "Dữ liệu giả lập" ở Nguồn dữ liệu, dải vàng, nút giả lập trên thanh
 * trên). Bật: cất phiên thật, vào phiên giả lập vai trò Quản trị hệ thống (api/demoUsers.js — tải kèm dữ liệu mẫu, chunk
 * riêng). Tắt: trả lại phiên thật. Cả hai tải lại trang — số liệu thật đã tải không lẫn với số giả (và ngược lại).
 */
export async function startSimulation() {
  const { demoAuth } = await import('./demoUsers');
  const { auth, setSimulationMode, setAuth } = useStore.getState();
  if (auth && auth.token !== DEMO_TOKEN) stashRealAuth(auth);
  setSimulationMode(true);
  setAuth(demoAuth('quan_tri'));
  window.location.reload();
}

export function stopSimulation() {
  useStore.getState().setSimulationMode(false);
  window.location.reload();
}
