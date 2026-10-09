import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import SessionKeeper from './components/layout/SessionKeeper';
import Toasts from './components/common/Toasts';
import { useSocket } from './api/useSocket';
import { api } from './api/client';
import { useStore } from './app/store';
import { usePermission } from './rbac/usePermission';
import { watchAudioUnlock } from './utils/audio';
import { FirstPasswordChange, ForgotPassword, ResetPassword } from './pages/AccountPages'; // nhỏ, UserMenu cũng dùng → import tĩnh
// Mỗi trang một chunk tải khi cần: người dân mở cổng công khai không phải tải giao diện điều hành
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MonitoringMap = lazy(() => import('./pages/MonitoringMap'));
const Resources = lazy(() => import('./pages/Resources'));
const RescueCenter = lazy(() => import('./pages/RescueCenter'));
const Alerts = lazy(() => import('./pages/Alerts'));
const AccessControl = lazy(() => import('./pages/AccessControl'));
const DataSources = lazy(() => import('./pages/DataSources'));
const CitizenReports = lazy(() => import('./pages/CitizenReports'));
const DataImport = lazy(() => import('./pages/DataImport'));
const PublicPortal = lazy(() => import('./pages/public/PublicPortal'));
const MissionPage = lazy(() => import('./pages/public/MissionPage'));

function PageLoading() {
  return <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted">Đang tải…</div>;
}

function Guard({ obj, act, or, children }) {
  const main = usePermission(obj, act);
  const alt = usePermission(or?.[0], or?.[1]); // quyền thay thế (VD nhập dữ liệu: nhập thẳng HOẶC gửi chờ duyệt)
  return main || (or && alt) ? children : <NoAccess />;
}

function NoAccess() {
  return (
    <div className="p-8 text-center text-muted">
      <div className="text-lg font-semibold text-ink">Không có quyền truy cập</div>
      Tài khoản của bạn chưa được cấp quyền cho chức năng này. Liên hệ lãnh đạo BCH để được phân quyền.
    </div>
  );
}

function Shell() {
  useSocket();
  const setAuth = useStore((s) => s.setAuth);
  // Chế độ trình chiếu của Dashboard (màn hình lớn phòng điều hành): chỉ còn nội dung, không thanh trên / menu trái
  const presentation = useStore((s) => s.presentation);
  // Chuông SOS: mở khoá âm thanh ở lần bấm / gõ phím đầu tiên (trình duyệt chặn tới lúc đó)
  useEffect(() => (useStore.getState().audioReady ? undefined : watchAudioUnlock(useStore.getState().setAudioReady)), []);
  const qc = useQueryClient();

  // Làm mới quyền khi tải lại trang (quyền có thể đã đổi từ phiên trước). Chỉ lúc mở: token gia hạn định kỳ
  // (SessionKeeper) không cần tải lại mọi thứ
  useEffect(() => {
    api('/auth/me')
      .then((user) => setAuth({ ...useStore.getState().auth, user }))
      .catch(() => {});
    qc.invalidateQueries();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col print:block print:h-auto">
      {!presentation && <Header />}
      <SessionKeeper />
      <div className="flex min-h-0 flex-1 print:block">
        {!presentation && <Sidebar />}
        <main className="min-w-0 flex-1 overflow-auto scroll-thin print:overflow-visible">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Guard obj="monitoring" act="view"><Dashboard /></Guard>} />
              <Route path="/ban-do" element={<Guard obj="monitoring" act="view"><MonitoringMap /></Guard>} />
              <Route path="/nguon-luc" element={<Guard obj="resource" act="view"><Resources /></Guard>} />
              <Route path="/cuu-ho" element={<Guard obj="sos" act="view"><RescueCenter /></Guard>} />
              <Route path="/canh-bao" element={<Guard obj="alert" act="view"><Alerts /></Guard>} />
              <Route path="/phan-anh" element={<Guard obj="report" act="view"><CitizenReports /></Guard>} />
              <Route path="/nguon-du-lieu" element={<Guard obj="integration" act="view"><DataSources /></Guard>} />
              <Route path="/nhap-du-lieu" element={<Guard obj="data" act="import" or={['data', 'submit']}><DataImport /></Guard>} />
              <Route path="/phan-quyen" element={<Guard obj="user" act="view"><AccessControl /></Guard>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/** ?next= chỉ nhận đường dẫn nội bộ. Kiểm tra bằng cách phân giải như trình duyệt: "/\evil.com" (trình duyệt đổi \ thành /
 * → "//evil.com") hay "/<tab>/evil.com" đều ra origin khác → bị loại. Chỉ chặn chuỗi bắt đầu "//" là chưa đủ. */
function safeNext(next) {
  if (!next || !next.startsWith('/')) return null;
  try {
    const u = new URL(next, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
}

/** Đã đăng nhập mà mở /dang-nhap → về trang định vào (?next=) hoặc Tổng quan. */
function AfterLogin() {
  const [params] = useSearchParams();
  return <Navigate to={safeNext(params.get('next')) || '/dashboard'} replace />;
}

function RequireLogin() {
  const location = useLocation();
  return <Navigate to={`/dang-nhap?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}

export default function App() {
  const auth = useStore((s) => s.auth);
  const loggedIn = !!auth?.token;
  return (
    <>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* Công khai — không cần đăng nhập */}
          <Route path="/cong-khai" element={<PublicPortal />} />
          <Route path="/dang-nhap" element={loggedIn ? <AfterLogin /> : <Login />} />
          <Route path="/quen-mat-khau" element={<ForgotPassword />} />
          <Route path="/dat-lai-mat-khau" element={<ResetPassword />} />
          {/* Link nhiệm vụ cho trưởng nhóm hiện trường: mã sau dấu #, không cần tài khoản */}
          <Route path="/nhiem-vu" element={<MissionPage />} />
          <Route path="/" element={loggedIn ? <Navigate to="/dashboard" replace /> : <PublicPortal />} />
          {/* Điều hành — cần đăng nhập; mật khẩu do cấp trên đặt → đổi trước khi vào */}
          <Route
            path="/*"
            element={!loggedIn ? <RequireLogin /> : auth.user?.must_change_password ? <FirstPasswordChange /> : <Shell key={auth.user?.id} />}
          />
        </Routes>
      </Suspense>
      <Toasts />
    </>
  );
}
