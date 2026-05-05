'use client'
import { useEffect, useRef } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'

interface Props {
  title: string
  message: string
  warning?: string        // extra red warning line (e.g. "All tasks will be deleted")
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export default function ConfirmDialog({
  title, message, warning, confirmLabel = 'Delete', onConfirm, onCancel, danger = true,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus confirm on mount, close on Escape
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="palette-overlay"
      onClick={onCancel}
      style={{ alignItems: 'center', paddingTop: 0 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(420px, calc(100vw - 40px))',
          background: 'linear-gradient(180deg, var(--panel), var(--panel2))',
          border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,.5)',
          overflow: 'hidden',
          animation: 'slideDown .18s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: danger ? 'rgba(255,92,122,.15)' : 'rgba(255,204,102,.15)',
            border: `1px solid ${danger ? 'rgba(255,92,122,.30)' : 'rgba(255,204,102,.30)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={20} style={{ color: danger ? '#ff5c7a' : '#ffcc66' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--text)', margin: 0 }}>
              {title}
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        {/* Warning box */}
        {warning && (
          <div style={{
            margin: '14px 20px 0',
            padding: '10px 14px',
            background: 'rgba(255,92,122,.08)',
            border: '1px solid rgba(255,92,122,.25)',
            borderRadius: 12,
            fontSize: 12,
            color: '#ff5c7a',
            fontWeight: 600,
            fontFamily: 'Raleway, sans-serif',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Trash2 size={13} style={{ flexShrink: 0 }} />
            {warning}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '18px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn-ghost" style={{ padding: '9px 18px', fontSize: 13 }}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              padding: '9px 18px', fontSize: 13, fontWeight: 700,
              fontFamily: 'Raleway, sans-serif', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: danger ? 'rgba(255,92,122,.85)' : 'var(--brand)',
              color: '#fff',
              boxShadow: danger ? '0 4px 14px rgba(255,92,122,.30)' : '0 4px 14px rgba(19,78,74,.28)',
              transition: 'opacity .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
