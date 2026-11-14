import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrations = [
  '20261114165605_mcp_purchase_atomic.sql',
  '20261114170932_mcp_input_create.sql',
  '20261114171759_mcp_sale_price.sql',
  '20261114172356_mcp_order_create.sql',
  '20261114172821_mcp_product_create.sql',
  '20261114173307_mcp_manual_sale.sql'
];
const lock = 'lock table public.app_users, public.company_subscriptions, public.plan_modules, public.user_module_overrides in share mode;';

test('cada RPC bloqueia todas as fontes de autorizacao antes da previa e exige READ COMMITTED', async () => {
  for (const filename of migrations) {
    const sql = (await readFile(new URL(`../../../../../supabase/migrations/${filename}`, import.meta.url), 'utf8')).toLowerCase();
    const isolation = sql.indexOf("current_setting('transaction_isolation') <> 'read committed'");
    const authorizationLock = sql.indexOf(lock);
    const previewLock = sql.indexOf('select * into v_preview');
    const authorizationCheck = sql.indexOf('select exists(select 1 from public.app_users');
    assert.ok(isolation >= 0, `${filename}: falta protecao de isolamento`);
    assert.ok(authorizationLock > isolation && previewLock > authorizationLock && authorizationCheck > previewLock, `${filename}: ordem de bloqueios e consulta incorreta`);
    assert.equal(sql.indexOf(lock, authorizationLock + lock.length), -1, `${filename}: bloqueio de autorizacao duplicado`);
  }
});
