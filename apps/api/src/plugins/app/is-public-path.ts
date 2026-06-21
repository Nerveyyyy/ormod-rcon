export const isPublicPath = (url: string): boolean => {
  const q = url.indexOf('?')
  const path = (q === -1 ? url : url.slice(0, q)).toLowerCase()
  if (path === '/docs' || path.startsWith('/docs/')) {
    return false
  }
  if (!path.startsWith('/api/')) {
    return true
  }
  return path.startsWith('/api/auth/')
}
