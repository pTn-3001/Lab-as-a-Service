'use client';

import { X } from 'lucide-react';
import React, { useEffect } from 'react';

export interface DialogAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
}

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  actions?: DialogAction[];
  onClose?: () => void;
  children?: React.ReactNode;
}

export function Dialog({ open, title, description, actions = [], onClose, children }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {description && <p className="text-sm leading-relaxed text-gray-600">{description}</p>}
          {children}
        </div>

        {/* Footer */}
        {actions.length > 0 && (
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`rounded-[6px] px-6 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 shadow-[0_0_1px_1px_rgba(0,0,0,0.05)] ${
                  action.variant === 'danger'
                    ? 'bg-red-600 text-white border border-red-600 hover:bg-red-700 hover:border-red-700'
                    : action.variant === 'ghost'
                    ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300'
                    : 'bg-[#FF6900] text-white border border-[#FF6900] hover:bg-[#D45700] hover:border-[#D45700]'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Convenience hook for simple confirm dialogs
export function useConfirm() {
  const [state, setState] = React.useState<{
    open: boolean;
    title: string;
    description?: string;
    resolve?: (confirmed: boolean) => void;
    variant?: 'default' | 'danger';
  }>({ open: false, title: '' });

  const confirm = (title: string, description?: string, variant?: 'default' | 'danger') =>
    new Promise<boolean>((resolve) => {
      setState({ open: true, title, description, resolve, variant });
    });

  const handleClose = (confirmed: boolean) => {
    state.resolve?.(confirmed);
    setState({ open: false, title: '' });
  };

  const ConfirmDialog = () => (
    <Dialog
      open={state.open}
      title={state.title}
      description={state.description}
      onClose={() => handleClose(false)}
      actions={[
        { label: 'Hủy', onClick: () => handleClose(false), variant: 'ghost' },
        {
          label: 'Xác nhận',
          onClick: () => handleClose(true),
          variant: state.variant === 'danger' ? 'danger' : 'primary',
        },
      ]}
    />
  );

  return { confirm, ConfirmDialog };
}
