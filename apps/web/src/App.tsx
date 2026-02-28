import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider } from './context/AuthContext.js'
import { ServerProvider } from './context/ServerContext.js'
import AppShell from './components/layout/AppShell.js'
import Login from './pages/Login.js'
import Setup from './pages/Setup.js'
import Dashboard from './pages/Dashboard.js'
import Players from './pages/Players.js'
import Settings from './pages/Settings.js'
import Console from './pages/Console.js'
import AccessControl from './pages/AccessControl.js'
import WipeManager from './pages/WipeManager.js'
import Schedules from './pages/Schedules.js'
import ServerManagement from './pages/ServerManagement.js'
import UserManagement from './pages/UserManagement.js'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError)
      return (
        <div className="card" style={{ margin: '2rem' }}>
          Something went wrong. Please refresh.
        </div>
      )
    return this.props.children
  }
}

export default function App() {
  return (
    <BrowserRouter>
      {/*
        AuthProvider wraps everything inside BrowserRouter so it can use
        useNavigate/useLocation.  It checks session on route changes and
        redirects to /login or /setup as needed.
      */}
      <AuthProvider>
        <ServerProvider>
          <ErrorBoundary>
            <Routes>
              {/* ── Public routes (no auth required) ────── */}
              <Route path="/login" element={<Login />} />
              <Route path="/setup" element={<Setup />} />

              {/* ── Protected app shell ──────────────────── */}
              <Route path="/" element={<AppShell />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="players" element={<Players />} />
                <Route path="settings" element={<Settings />} />
                <Route path="console" element={<Console />} />
                <Route path="access-control" element={<AccessControl />} />
                <Route path="wipe" element={<WipeManager />} />
                <Route path="schedules" element={<Schedules />} />
                <Route path="servers" element={<ServerManagement />} />
                <Route path="users" element={<UserManagement />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </ServerProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
