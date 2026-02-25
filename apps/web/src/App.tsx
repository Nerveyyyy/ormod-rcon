import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.js';
import { ServerProvider } from './context/ServerContext.js';
import AppShell from './components/layout/AppShell.js';
import Login from './pages/Login.js';
import Setup from './pages/Setup.js';
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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/*
        AuthProvider wraps everything inside BrowserRouter so it can use
        useNavigate/useLocation.  It checks session on route changes and
        redirects to /login or /setup as needed.
      */}
      <AuthProvider>
        <ServerProvider>
          <Routes>
            {/* ── Public routes (no auth required) ────── */}
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />

            {/* ── Protected app shell ──────────────────── */}
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
        </ServerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
