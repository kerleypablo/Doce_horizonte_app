import type { ReactNode } from 'react';

type EntityEditorPanelProps = {
  backTo: string;
  title: string;
  onBack: (to: string) => void;
  children: ReactNode;
};

export const EntityEditorPanel = ({ backTo, title, onBack, children }: EntityEditorPanelProps) => (
  <div className="panel">
    <div className="panel-title-row">
      <button type="button" className="icon-button small" onClick={() => onBack(backTo)} aria-label="Voltar">
        <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      </button>
      <h3>{title}</h3>
    </div>
    {children}
  </div>
);
