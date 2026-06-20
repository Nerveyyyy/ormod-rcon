import {
  createContext,
  useContext,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

export interface AuthState {
  isAuthenticated: boolean
  login: () => void
  logout: () => void
}

const STORAGE_KEY = 'ormod.authed'

const AuthContext = createContext<AuthState | null>(null)

export const AuthProvider = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState((): boolean => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  const login = (): void => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsAuthenticated(true)
  }

  const logout = (): void => {
    localStorage.removeItem(STORAGE_KEY)
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
