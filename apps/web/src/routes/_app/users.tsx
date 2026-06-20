import { createFileRoute } from '@tanstack/react-router'
import type { JSX } from 'react'
import { Input } from '@/components/ui/input'

const UsersPage = (): JSX.Element => {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Users</h1>
      <div className="max-w-sm space-y-2">
        <label htmlFor="user-search" className="text-sm text-muted-foreground">
          Search
        </label>
        <Input id="user-search" placeholder="Filter users…" />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_app/users')({
  component: UsersPage,
})
