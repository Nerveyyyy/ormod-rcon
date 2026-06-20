import { createFileRoute } from '@tanstack/react-router'
import type { JSX } from 'react'

const HomePage = (): JSX.Element => {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-foreground">Home</h1>
      <p className="text-muted-foreground">
        Welcome to the ORMOD: RCON dashboard.
      </p>
    </div>
  )
}

export const Route = createFileRoute('/_app/')({
  component: HomePage,
})
