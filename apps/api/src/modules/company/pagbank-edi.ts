import { createHash } from 'node:crypto';

export const pagBankSaleOrigins = ['balcao', 'rua', 'porta-a-porta', 'ifood', 'outros'] as const;
export type PagBankSaleOrigin = (typeof pagBankSaleOrigins)[number];
export type PagBankPaymentMethod = 'PIX' | 'CARTAO' | 'VOUCHER';

export type PagBankEdiConfig = {
  ediUser: string;
  ediToken: string;
  defaultOrigin: PagBankSaleOrigin;
};

export type PagBankEdiTestResult = {
  ok: boolean;
  status: number;
  validado: boolean | null;
  detail: string;
  testedDate: string;
};

export type PagBankImportCandidate = {
  externalId: string;
  occurredAt: string;
  amount: number;
  paymentMethod: PagBankPaymentMethod;
  description: string;
  payload: Record<string, unknown>;
};

const EDI_BASE_URL = 'https://edi.api.pagbank.com.br/movement/v3.00';

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

const getYesterday = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return toDateOnly(date);
};

const withTimeout = async (input: string, init: RequestInit, timeoutMs = 15_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const buildMovementUrl = (kind: 'transactional' | 'balances', date: string) =>
  `${EDI_BASE_URL}/${kind}/${date}?pageNumber=1&pageSize=1000`;

const readResponseBody = async (response: Response) => {
  const text = await response.text();
  if (!text) return { text: '', json: null as unknown };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: null as unknown };
  }
};

const getValidatedHeader = (response: Response) => {
  const raw = response.headers.get('VALIDADO');
  if (!raw) return null;
  if (raw.toUpperCase() === 'TRUE') return true;
  if (raw.toUpperCase() === 'FALSE') return false;
  return null;
};

const parseAmount = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickString = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const pickAmount = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const parsed = parseAmount(row[key]);
    if (parsed !== null) return parsed;
  }
  return null;
};

const toIsoDateTime = (value: string, fallbackDate: string) => {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00.000Z`).toISOString();
  return new Date(`${fallbackDate}T12:00:00.000Z`).toISOString();
};

const pickOccurredAt = (row: Record<string, unknown>, fallbackDate: string) => {
  const raw = pickString(row, [
    'transaction_date',
    'transactionDate',
    'date',
    'created_at',
    'createdAt',
    'event_date',
    'eventDate',
    'release_date',
    'releaseDate'
  ]);
  return raw ? toIsoDateTime(raw, fallbackDate) : new Date(`${fallbackDate}T12:00:00.000Z`).toISOString();
};

const inferPaymentMethod = (row: Record<string, unknown>) => {
  const raw = [
    pickString(row, ['payment_method', 'paymentMethod', 'method', 'type', 'transaction_type', 'payment_type']),
    pickString(row, ['payment_method_description', 'paymentMethodDescription', 'type_description', 'description']),
    pickString(row, ['card_type', 'cardType', 'card_brand', 'cardBrand'])
  ]
    .join(' ')
    .toLowerCase();

  if (!raw) return null;
  if (raw.includes('voucher') || raw.includes('vr') || raw.includes('va') || raw.includes('benef')) return 'VOUCHER';
  if (raw.includes('pix')) return 'PIX';
  if (
    raw.includes('cart') ||
    raw.includes('card') ||
    raw.includes('credito') ||
    raw.includes('crédito') ||
    raw.includes('debito') ||
    raw.includes('débito')
  ) return 'CARTAO';
  return null;
};

const createDerivedExternalId = (row: Record<string, unknown>, fallbackDate: string, amount: number, paymentMethod: string) => {
  const base = JSON.stringify({
    fallbackDate,
    amount,
    paymentMethod,
    nsu: row.nsu ?? null,
    authorizationCode: row.authorization_code ?? row.authorizationCode ?? null,
    cardBrand: row.card_brand ?? row.cardBrand ?? null,
    raw: row
  });
  return createHash('sha1').update(base).digest('hex');
};

const pickExternalId = (row: Record<string, unknown>, fallbackDate: string, amount: number, paymentMethod: string) => {
  const explicit = pickString(row, [
    'id',
    'code',
    'transaction_id',
    'transactionId',
    'transaction_code',
    'transactionCode',
    'reference',
    'reference_id',
    'referenceId',
    'nsu',
    'payment_id',
    'paymentId',
    'event_id',
    'eventId'
  ]);
  return explicit || createDerivedExternalId(row, fallbackDate, amount, paymentMethod);
};

const buildDescription = (row: Record<string, unknown>, paymentMethod: PagBankPaymentMethod) => {
  const explicit = pickString(row, ['description', 'summary', 'title']);
  if (explicit) return explicit.slice(0, 120);
  const suffix = paymentMethod === 'PIX' ? 'Pix' : paymentMethod === 'VOUCHER' ? 'Voucher' : 'Cartao';
  return `Venda PagBank ${suffix}`;
};

const extractRows = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const arrayCandidates = ['data', 'items', 'results', 'movements', 'transactions', 'content'];
  for (const key of arrayCandidates) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
  }
  return [];
};

const buildHeaders = (config: PagBankEdiConfig) => ({
  USER: config.ediUser,
  TOKEN: config.ediToken,
  Accept: 'application/json'
});

export const testPagBankEdiConnection = async (config: PagBankEdiConfig): Promise<PagBankEdiTestResult> => {
  const testedDate = getYesterday();
  const response = await withTimeout(buildMovementUrl('balances', testedDate), {
    method: 'GET',
    headers: buildHeaders(config)
  });
  const validado = getValidatedHeader(response);
  const { text, json } = await readResponseBody(response);

  if (!response.ok) {
    const detail = typeof json === 'object' && json && 'message' in json
      ? String((json as { message?: unknown }).message ?? 'Falha ao consultar PagBank.')
      : (text || 'Falha ao consultar PagBank.');
    return {
      ok: false,
      status: response.status,
      validado,
      detail,
      testedDate
    };
  }

  return {
    ok: true,
    status: response.status,
    validado,
    detail: validado === false
      ? 'Conexao ok. O PagBank respondeu, mas ainda marca os dados dessa data como nao validados.'
      : 'Conexao ok com a API EDI do PagBank.',
    testedDate
  };
};

export const fetchPagBankTransactionalCandidates = async (config: PagBankEdiConfig, date: string) => {
  const response = await withTimeout(buildMovementUrl('transactional', date), {
    method: 'GET',
    headers: buildHeaders(config)
  });
  const validado = getValidatedHeader(response);
  const { text, json } = await readResponseBody(response);

  if (!response.ok) {
    const detail = typeof json === 'object' && json && 'message' in json
      ? String((json as { message?: unknown }).message ?? 'Falha ao consultar transacoes no PagBank.')
      : (text || 'Falha ao consultar transacoes no PagBank.');
    throw new Error(detail);
  }

  const rows = extractRows(json);
  const candidates: PagBankImportCandidate[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const paymentMethod = inferPaymentMethod(row);
    const amount = pickAmount(row, [
      'gross_amount',
      'grossAmount',
      'amount',
      'transaction_amount',
      'transactionAmount',
      'value',
      'net_amount',
      'netAmount'
    ]);

    if (!paymentMethod || amount === null || amount <= 0) {
      warnings.push('Uma ou mais linhas retornadas pelo PagBank nao puderam ser convertidas em lancamento.');
      continue;
    }

    const occurredAt = pickOccurredAt(row, date);
    const externalId = pickExternalId(row, date, amount, paymentMethod);
    candidates.push({
      externalId,
      occurredAt,
      amount,
      paymentMethod,
      description: buildDescription(row, paymentMethod),
      payload: row
    });
  }

  return {
    validado,
    rawCount: rows.length,
    candidates,
    warnings: Array.from(new Set(warnings))
  };
};
