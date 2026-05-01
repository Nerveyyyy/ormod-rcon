import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom's scroll APIs are unimplemented; TanStack Router's default
// scroll-restoration calls them during navigation. Stub so tests stay
// quiet when rendering inside a real router.
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true })
Object.defineProperty(window, 'scroll', { value: vi.fn(), writable: true })
