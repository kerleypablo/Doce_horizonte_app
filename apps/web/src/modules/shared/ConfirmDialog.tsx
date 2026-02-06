import { ReactNode } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: ReactNode;
};

export const ConfirmDialog = ({
  open,
  title = 'Confirmar',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  icon
}: ConfirmDialogProps) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-icon">
            {icon ?? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 7v6m0 4h.01M10.3 4.9l-7.2 12.4A2 2 0 0 0 4.8 20h14.4a2 2 0 0 0 1.7-2.7L13.7 4.9a2 2 0 0 0-3.4 0z" />
              </svg>
            )}
          </div>
          <div>
            <h4>{title}</h4>
            <p>{message}</p>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
