import type { ComponentProps, JSX } from 'react'
import { cn } from '@/lib/utils'

export const Input = ({
  className,
  type,
  ...props
}: ComponentProps<'input'>): JSX.Element => {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}
