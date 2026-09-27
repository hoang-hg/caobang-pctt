import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Toasts from './components/common/Toasts';
import { useSocket } from './api/useSocket';
import { api } from './api/client';
import { useStore } from './app/store';
import { usePermission } from './rbac/usePermission';
import { ForgotPassword, ResetPassword } from './pages/AccountPages'; // nhỏ, UserMenu cũng dùng → import tĩnh
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
const PublicPortal = lazy(() => import('./pages/public/PublicPortal'));

function PageLoading() {
  return <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted">Đang tải…</div>;
}

function Guard({ obj, act, children }) {
  return usePermission(obj, act) ? children : <NoAccess />;
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
  const { setAuth, auth } = useStore();
  const qc = useQueryClient();

  // Làm mới quyền khi tải lại trang (quyền có thể đã đổi từ phiên trước)
  useEffect(() => {
    api('/auth/me')
      .then((user) => setAuth({ ...useStore.getState().auth, user }))
      .catch(() => {});
    qc.invalidateQueries();
  }, [auth?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto scroll-thin">
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
              <Route path="/phan-quyen" element={<Guard obj="user" act="view"><AccessControl /></Guard>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/** Đã đăng nhập mà mở /dang-nhap → về trang định vào (?next=) hoặc Tổng quan. Chỉ nhận đường dẫn nội bộ. */
function AfterLogin() {
  const [params] = useSearchParams();
  const next = params.get('next');
  return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'} replace />;
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
          <Route path="/" element={loggedIn ? <Navigate to="/dashboard" replace /> : <PublicPortal />} />
          {/* Điều hành — cần đăng nhập */}
          <Route path="/*" element={loggedIn ? <Shell key={auth.user?.id} /> : <RequireLogin />} />
        </Routes>
      </Suspense>
      <Toasts />
    </>
  );
}
