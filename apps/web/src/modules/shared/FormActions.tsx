type FormActionsProps = {
  cancelLabel?: string;
  submitLabel: string;
  onCancel: () => void;
};

export const FormActions = ({
  cancelLabel = 'Cancelar',
  submitLabel,
  onCancel
}: FormActionsProps) => (
  <div className="actions">
    <button type="button" className="ghost" onClick={onCancel}>
      {cancelLabel}
    </button>
    <button type="submit">{submitLabel}</button>
  </div>
);
