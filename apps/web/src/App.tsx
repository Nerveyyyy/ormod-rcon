import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ServerProvider } from './context/ServerContext.js';
import AppShell from './components/layout/AppShell.js';
import Dashboard from './pages/Dashboard.js';
import Players from './pages/Players.js';
import Settings from './pages/Settings.js';
import Console from './pages/Console.js';
import AccessControl from './pages/AccessControl.js';
import WipeManager from './pages/WipeManager.js';
import Schedules from './pages/Schedules.js';
import ServerManagement from './pages/ServerManagement.js';

export default function App() {
  return (
    <ServerProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"      element={<Dashboard />} />
            <Route path="players"        element={<Players />} />
            <Route path="settings"       element={<Settings />} />
            <Route path="console"        element={<Console />} />
            <Route path="access-control" element={<AccessControl />} />
            <Route path="wipe"           element={<WipeManager />} />
            <Route path="schedules"      element={<Schedules />} />
            <Route path="servers"        element={<ServerManagement />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ServerProvider>
  );
}
