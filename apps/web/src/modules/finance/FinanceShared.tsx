import type React from 'react';
import { useNavigate } from 'react-router-dom';

export const FinanceAccessBlocked = () => (
  <div className="panel">
    <h3>Modulo Financeiro</h3>
    <p>Seu usuario nao tem acesso ao modulo financeiro.</p>
  </div>
);

export const FinanceHeader = ({ title, backTo }: { title: string; backTo?: string }) => {
  const navigate = useNavigate();

  return (
    <div className="panel-title-row">
      {backTo ? (
        <button type="button" className="icon-button small" onClick={() => navigate(backTo)} aria-label={`Voltar para ${title}`}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        </button>
      ) : null}
    </div>
  );
};
