type LoadingOverlayProps = {
  open: boolean;
  label?: string;
};

export const LoadingOverlay = ({ open, label = 'Salvando...' }: LoadingOverlayProps) => {
  if (!open) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-content">
        <span className="loading-spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
};
