import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync('supabase/migrations/20261109113120_market_data_foundation.sql','utf8');
const worker = readFileSync('supabase/functions/market-data-ingest/index.ts','utf8');
const ticker = readFileSync('supabase/functions/market-ticker/index.ts','utf8');

test('market-data staging is private, disabled, and license-gated', () => {
  assert.match(sql, /stage text not null default 'simulation'/);
  assert.match(sql, /storage_approved boolean not null default false/);
  assert.match(sql, /external_display_approved boolean not null default false/);
  for (const name of ['market_data_control','market_data_instruments','market_data_candles','market_data_quotes','market_data_sync_runs','market_data_quota']) {
    assert.ok(sql.includes('create table public.' + name));
    assert.ok(sql.includes('alter table public.' + name + ' enable row level security'));
    assert.ok(sql.includes('revoke all on public.' + name + ' from public, anon, authenticated'));
  }
});
test('simulation refresh never overwrites external price_source', () => {
  assert.match(sql, /where m.id = a.id and a.price_source = 'simulated'/);
  assert.match(ticker, /eq\('price_source', 'simulated'\)/);
});
test('licensed worker never changes user portfolios or live asset prices', () => {
  assert.match(worker, /LICENSED_INGESTION_DISABLED/);
  assert.match(worker, /reserve_market_data_credits/);
  assert.match(worker, /from\('market_data_candles'\)/);
  assert.doesNotMatch(worker, /from\('assets'\)/);
  assert.doesNotMatch(worker, /from\('portfolios'\)/);
});
