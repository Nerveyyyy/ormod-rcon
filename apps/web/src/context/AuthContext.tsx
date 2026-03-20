/**
 * AuthContext.tsx
 *
 * Wraps the app in an auth gate using a single GET /api/me call:
 *   - 200 + { user } → authenticated, set user
 *   - 200 + { setupRequired } → redirect to /setup
 *   - 401 → redirect to /login
 *   - 429 → keep current user (if loaded), surface rate-limit message
 *
 * The call fires once on mount. Subsequent navigations skip the fetch
 * if a user is already loaded. BetterAuth's HTTP-only cookie handles
 * automatic renewal — no polling needed.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { authClient } from '../lib/auth-client.js'
import { clearCsrfToken } from '../api/client.js'

type AuthUser = {
  id: string
  name: string
  email: string
  role: string // OWNER | ADMIN | VIEWER
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  rateLimitMsg: string | null
  dismissRateLimit: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  rateLimitMsg: null,
  dismissRateLimit: () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null)
  // Ref tracks user across effect re-runs without triggering them
  const userRef = useRef<AuthUser | null>(null)

  const dismissRateLimit = useCallback(() => setRateLimitMsg(null), [])

  useEffect(() => {
    async function bootstrap() {
      try {
        // User already loaded — just guard /setup and /login
        if (userRef.current) {
          if (location.pathname === '/setup' || location.pathname === '/login') {
            navigate('/', { replace: true })
          }
          return
        }

        // On /login, let the page render without fetching
        if (location.pathname === '/login') return

        const res = await fetch('/api/me')

        // Rate-limited — stay on current page. Session is still valid;
        // the user just needs to wait. Don't clear existing user state.
        if (res.status === 429) {
          let message = 'Rate limit exceeded. Please wait a moment and try again.'
          try {
            const data = await res.json()
            if (data?.message) message = data.message
          } catch { /* use default */ }
          setRateLimitMsg(message)
          return
        }

        if (res.ok) {
          const data = await res.json()

          if (data.setupRequired) {
            if (location.pathname !== '/setup') {
              navigate('/setup', { replace: true })
            }
            return
          }

          if (data.user) {
            userRef.current = data.user
            setUser(data.user)
            if (location.pathname === '/setup') {
              navigate('/', { replace: true })
            }
            return
          }
        }

        // 401 or unexpected response — send to login
        if (location.pathname !== '/login' && location.pathname !== '/setup') {
          navigate('/login', { replace: true })
        }
      } catch {
        if (location.pathname !== '/login') {
          navigate('/login', { replace: true })
        }
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [location.pathname])

  const signOut = async () => {
    await authClient.signOut()
    clearCsrfToken()
    userRef.current = null
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    <AuthContext.Provider value={{ user, loading, rateLimitMsg, dismissRateLimit, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}