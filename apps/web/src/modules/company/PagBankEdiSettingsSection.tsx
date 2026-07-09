import { useEffect, useState } from 'react';
import { apiFetch } from '../shared/api.ts';
import { SelectField } from '../shared/SelectField.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';
import { saleOriginLabels } from '../finance/constants.ts';
import type { SaleOrigin } from '../finance/types.ts';

type PagBankEdiSettings = {
  configured: boolean;
  ediUser: string;
  hasToken: boolean;
  maskedToken: string;
  defaultOrigin: SaleOrigin;
  active: boolean;
  autoImportEnabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: 'SUCCESS' | 'ERROR' | null;
  lastTestDetail: string;
  lastImportedAt: string | null;
  lastImportStatus: 'SUCCESS' | 'ERROR' | null;
  lastImportDetail: string;
};

type PagBankEdiTestResponse = {
  ok: boolean;
  status?: number;
  validado?: boolean | null;
  detail: string;
  testedDate?: string;
};

type PagBankEdiImportResponse = {
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  warnings: string[];
  date: string;
};

type Props = {
  token?: string;
};

type FormState = {
  ediUser: string;
  ediToken: string;
  defaultOrigin: SaleOrigin;
  active: boolean;
  autoImportEnabled: boolean;
};

const createEmptyForm = (): FormState => ({
  ediUser: '',
  ediToken: '',
  defaultOrigin: 'balcao',
  active: true,
  autoImportEnabled: false
});

const yesterdayDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Ainda nao executado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
};

export const PagBankEdiSettingsSection = ({ token }: Props) => {
  const [form, setForm] = useState<FormState>(createEmptyForm);
  const [importDate, setImportDate] = useState(yesterdayDate);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [testResult, setTestResult] = useState<PagBankEdiTestResponse | null>(null);
  const [importResult, setImportResult] = useState<PagBankEdiImportResponse | null>(null);

  const query = useCachedQuery(
    queryKeys.companyPagbankEdi,
    () => apiFetch<PagBankEdiSettings>('/company/pagbank-edi', { token }),
    { staleTime: 60_000, enabled: Boolean(token) }
  );

  useEffect(() => {
    if (!query.data) return;
    setForm({
      ediUser: query.data.ediUser ?? '',
      ediToken: '',
      defaultOrigin: query.data.defaultOrigin ?? 'balcao',
      active: query.data.active ?? true,
      autoImportEnabled: query.data.autoImportEnabled ?? false
    });
  }, [query.data]);

  const refresh = async () => {
    invalidateQueryCache(queryKeys.companyPagbankEdi);
    await query.refetch();
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await apiFetch<PagBankEdiSettings>('/company/pagbank-edi', {
        method: 'PUT',
        token,
        body: JSON.stringify(form)
      });
      await refresh();
      setForm((current) => ({ ...current, ediToken: '' }));
      setFeedback({ kind: 'success', message: 'Configuracao do PagBank salva.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar a configuracao do PagBank.';
      setFeedback({ kind: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setFeedback(null);
    setTestResult(null);
    try {
      const result = await apiFetch<PagBankEdiTestResponse>('/company/pagbank-edi/test', {
        method: 'POST',
        token
      });
      setTestResult(result);
      await refresh();
      setFeedback({ kind: 'success', message: result.detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao testar a conexao com o PagBank.';
      setTestResult({ ok: false, detail: message });
      setFeedback({ kind: 'error', message });
      await refresh().catch(() => undefined);
    } finally {
      setTesting(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setFeedback(null);
    setImportResult(null);
    try {
      const result = await apiFetch<PagBankEdiImportResponse>('/company/pagbank-edi/import', {
        method: 'POST',
        token,
        body: JSON.stringify({ date: importDate })
      });
      setImportResult(result);
      await refresh();
      setFeedback({
        kind: 'success',
        message: `Importacao concluida: ${result.importedCount} novo(s), ${result.duplicateCount} duplicado(s).`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao importar as movimentacoes do PagBank.';
      setFeedback({ kind: 'error', message });
      await refresh().catch(() => undefined);
    } finally {
      setImporting(false);
    }
  };

  if (query.loading && !query.data) {
    return <div className="form"><p>Carregando integracao PagBank...</p></div>;
  }

  if (query.error && !query.data) {
    return (
      <div className="form">
        <div className="panel">
          <p className="error">{query.error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form">
      <div className="company-settings-cost-card">
        <div className="company-settings-cost-head">
          <div>
            <h4>Integracao PagBank EDI</h4>
            <p>Cadastre as credenciais da API EDI, teste a conexao e importe as vendas consolidadas do dia anterior.</p>
          </div>
        </div>

        <div className="grid-2">
          <label>
            USER do estabelecimento
            <input
              value={form.ediUser}
              onChange={(event) => setForm((current) => ({ ...current, ediUser: event.target.value }))}
              placeholder="Numero do estabelecimento PagBank"
            />
          </label>
          <label>
            Token EDI
            <input
              value={form.ediToken}
              onChange={(event) => setForm((current) => ({ ...current, ediToken: event.target.value }))}
              placeholder={query.data?.hasToken ? `Token salvo: ${query.data.maskedToken}` : 'Cole aqui o token EDI'}
            />
            <span className="muted">Deixe em branco para manter o token salvo.</span>
          </label>
        </div>

        <div className="grid-2">
          <label>
            Origem padrao dos lancamentos
            <SelectField
              value={form.defaultOrigin}
              onChange={(value) => setForm((current) => ({ ...current, defaultOrigin: value as SaleOrigin }))}
              options={[
                { value: 'balcao', label: saleOriginLabels.balcao },
                { value: 'rua', label: saleOriginLabels.rua },
                { value: 'porta-a-porta', label: saleOriginLabels['porta-a-porta'] },
                { value: 'ifood', label: saleOriginLabels.ifood },
                { value: 'outros', label: saleOriginLabels.outros }
              ]}
            />
          </label>
          <div className="company-settings-integrations-switches">
            <label className="settings-switch compact">
              <span>Integracao ativa</span>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
              />
            </label>
            <label className="settings-switch compact">
              <span>Preparar autoimportacao</span>
              <input
                type="checkbox"
                checked={form.autoImportEnabled}
                onChange={(event) => setForm((current) => ({ ...current, autoImportEnabled: event.target.checked }))}
              />
            </label>
          </div>
        </div>

        <div className="company-settings-integrations-actions">
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar credenciais'}
          </button>
          <button type="button" className="ghost" onClick={handleTest} disabled={testing || saving}>
            {testing ? 'Testando...' : 'Testar conexao'}
          </button>
        </div>
      </div>

      <div className="company-settings-cost-card subtle">
        <div className="company-settings-cost-head">
          <div>
            <h4>Importacao manual</h4>
            <p>Use para validar a integracao agora. O ideal operacional continua sendo importar em D+1, quando o PagBank marcar os dados como validados.</p>
          </div>
        </div>

        <div className="grid-2">
          <label>
            Data para importar
            <input type="date" value={importDate} onChange={(event) => setImportDate(event.target.value)} />
          </label>
          <div className="company-settings-import-status">
            <strong>Ultima importacao</strong>
            <span>{formatDateTime(query.data?.lastImportedAt ?? null)}</span>
            <span className={query.data?.lastImportStatus === 'ERROR' ? 'error-text' : 'muted'}>
              {query.data?.lastImportDetail || 'Sem historico ainda.'}
            </span>
          </div>
        </div>

        <div className="company-settings-integrations-actions">
          <button type="button" onClick={handleImport} disabled={importing || saving || testing}>
            {importing ? 'Importando...' : 'Importar dia'}
          </button>
        </div>

        {importResult ? (
          <div className="company-settings-import-result">
            <strong>Resumo da importacao de {importResult.date}</strong>
            <span>Novos lancamentos: {importResult.importedCount}</span>
            <span>Duplicados ignorados: {importResult.duplicateCount}</span>
            <span>Linhas puladas: {importResult.skippedCount}</span>
            {importResult.warnings.length > 0 ? (
              <div className="preview">
                {importResult.warnings.map((warning, index) => (
                  <span key={`${warning}-${index}`}>{warning}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="company-settings-cost-card subtle">
        <div className="company-settings-cost-head">
          <div>
            <h4>Historico rapido</h4>
            <p>Resultado do ultimo teste salvo na configuracao.</p>
          </div>
        </div>
        <div className="company-settings-import-result">
          <strong>Ultimo teste</strong>
          <span>{formatDateTime(query.data?.lastTestedAt ?? null)}</span>
          <span className={query.data?.lastTestStatus === 'ERROR' ? 'error-text' : 'muted'}>
            {query.data?.lastTestDetail || 'Sem historico ainda.'}
          </span>
          {testResult ? (
            <span className={testResult.ok ? 'success-text' : 'error-text'}>
              {testResult.detail}
            </span>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div className="panel">
          <p className={feedback.kind === 'error' ? 'error' : 'success-message'}>{feedback.message}</p>
        </div>
      ) : null}
    </div>
  );
};
