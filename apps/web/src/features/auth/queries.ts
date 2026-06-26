import { queryOptions } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface Me {
  id: string
  email: string
  name: string
  emailVerified: boolean
  image: string | null
  mustChangePassword: boolean
}

export const meKey = ['me'] as const

export const meQueryOptions = queryOptions({
  queryKey: meKey,
  queryFn: (): Promise<Me> => {
    return apiFetch<Me>('/api/me')
  },
  retry: false,
})
