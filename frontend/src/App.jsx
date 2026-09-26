import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Toasts from './components/common/Toasts';
import { useSocket } from './api/useSocket';
import Dashboard from './pages/Dashboard';
import MonitoringMap from './pages/MonitoringMap';
import Resources from './pages/Resources';
import RescueCenter from './pages/RescueCenter';
import Alerts from './pages/Alerts';

export default function App() {
  useSocket();
  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto scroll-thin">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ban-do" element={<MonitoringMap />} />
            <Route path="/nguon-luc" element={<Resources />} />
            <Route path="/cuu-ho" element={<RescueCenter />} />
            <Route path="/canh-bao" element={<Alerts />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
      <Toasts />
    </div>
  );
}
