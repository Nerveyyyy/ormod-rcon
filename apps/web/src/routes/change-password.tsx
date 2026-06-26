import { createFileRoute } from '@tanstack/react-router'
import type { JSX } from 'react'

const ChangePasswordPage = (): JSX.Element => {
  return <div />
}

export const Route = createFileRoute('/change-password')({
  component: ChangePasswordPage,
})
