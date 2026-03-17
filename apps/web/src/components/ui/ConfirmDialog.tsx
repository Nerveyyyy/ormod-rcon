import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  title: string
  confirmWord: string
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

/** Type-to-confirm modal. Pass the word the user must type as `confirmWord`. */
export default function ConfirmDialog({
  title,
  confirmWord,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const [input, setInput] = useState('')
  const ready = input === confirmWord
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [])

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        ref={modalRef}
        className="modal fadein"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="card-header" style={{ borderColor: 'var(--red-dim)' }}>
          <span className="card-title" id="confirm-dialog-title" style={{ color: 'var(--red)' }}>
            ⚠ {title}
          </span>
        </div>
        <div
          className="card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {children}
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
              Type{' '}
              <strong style={{ fontFamily: 'var(--mono)', color: 'var(--orange)' }}>
                {confirmWord}
              </strong>{' '}
              to confirm
            </div>
            <input
              className="text-input text-input-full"
              id="confirm-dialog-input"
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ready) onConfirm()
              }}
              placeholder={confirmWord}
              aria-label={`Type ${confirmWord} to confirm`}
            />
          </div>
          <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn-danger" disabled={!ready} onClick={onConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
