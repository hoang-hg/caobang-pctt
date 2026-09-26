import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Toasts from './components/common/Toasts';
import { useSocket } from './api/useSocket';
import { api } from './api/client';
import { useStore } from './app/store';
import { usePermission } from './rbac/usePermission';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MonitoringMap from './pages/MonitoringMap';
import Resources from './pages/Resources';
import RescueCenter from './pages/RescueCenter';
import Alerts from './pages/Alerts';
import AccessControl from './pages/AccessControl';
import DataSources from './pages/DataSources';

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
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Guard obj="monitoring" act="view"><Dashboard /></Guard>} />
            <Route path="/ban-do" element={<Guard obj="monitoring" act="view"><MonitoringMap /></Guard>} />
            <Route path="/nguon-luc" element={<Guard obj="resource" act="view"><Resources /></Guard>} />
            <Route path="/cuu-ho" element={<Guard obj="sos" act="view"><RescueCenter /></Guard>} />
            <Route path="/canh-bao" element={<Guard obj="alert" act="view"><Alerts /></Guard>} />
            <Route path="/nguon-du-lieu" element={<Guard obj="integration" act="view"><DataSources /></Guard>} />
            <Route path="/phan-quyen" element={<Guard obj="user" act="view"><AccessControl /></Guard>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useStore((s) => s.auth);
  return (
    <>
      {auth?.token ? <Shell key={auth.user?.id} /> : <Login />}
      <Toasts />
    </>
  );
}
