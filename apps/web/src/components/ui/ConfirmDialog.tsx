import { useState } from 'react';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  title: string;
  confirmWord: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/** Type-to-confirm modal. Pass the word the user must type as `confirmWord`. */
export default function ConfirmDialog({ title, confirmWord, onConfirm, onCancel, children }: ConfirmDialogProps) {
  const [input, setInput] = useState('');
  const ready = input === confirmWord;

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal fadein" onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ borderColor: 'var(--red-dim)' }}>
          <span className="card-title" style={{ color: 'var(--red)' }}>⚠ {title}</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {children}
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
              Type <strong style={{ fontFamily: 'var(--mono)', color: 'var(--orange)' }}>{confirmWord}</strong> to confirm
            </div>
            <input
              className="text-input text-input-full"
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && ready) onConfirm(); }}
              placeholder={confirmWord}
            />
          </div>
          <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="btn btn-danger" disabled={!ready} onClick={onConfirm}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}
