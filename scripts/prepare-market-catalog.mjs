#!/usr/bin/env node
// Review-only candidate import. No network, scraping, credentials or DB writes.
import { readFileSync } from 'node:fs';

const filename = process.argv[2];
if (!filename) throw new Error('Usage: node scripts/prepare-market-catalog.mjs catalog.json > mappings.sql');
const input = JSON.parse(readFileSync(filename, 'utf8'));
if (!Array.isArray(input) || input.length < 1 || input.length > 50000) throw new Error('Expected 1-50000 rows');
const sqlQuote = (s) => "'" + s.replaceAll("'", "''") + "'";
const seen = new Set();
const kinds = new Set(['stock', 'etf', 'index', 'forex', 'crypto', 'commodity']);
const rows = input.map((row, i) => {
  const { provider_symbol, provider_exchange = '', currency, instrument_type, libertex_code, libertex_name } = row ?? {};
  if (typeof provider_symbol !== 'string' || !/^[A-Z0-9./:_-]{1,40}$/.test(provider_symbol)
    || typeof provider_exchange !== 'string' || !/^[A-Z0-9._-]{0,40}$/.test(provider_exchange)
    || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)
    || !kinds.has(instrument_type) || typeof libertex_code !== 'string' || !libertex_code.trim()
    || libertex_code.length > 80 || typeof libertex_name !== 'string' || !libertex_name.trim()
    || libertex_name.length > 160) throw new Error('Invalid mapping at row ' + i);
  const unique = provider_symbol + ':' + provider_exchange;
  if (seen.has(unique)) throw new Error('Duplicate mapping ' + unique);
  seen.add(unique);
  return '(' + ['twelve_data', provider_symbol, provider_exchange, currency, instrument_type,
    libertex_code, libertex_name, 'unverified'].map(sqlQuote).join(',') + ',false)';
});
process.stdout.write('-- Operator-supplied, unverified mappings. No prices or assets created.\n');
process.stdout.write('begin;\ninsert into public.market_data_instruments (provider,provider_symbol,provider_exchange,currency,instrument_type,libertex_code,libertex_name,mapping_status,is_enabled) values\n');
process.stdout.write(rows.join(',\n') + '\non conflict (provider,provider_symbol,provider_exchange) do nothing;\ncommit;\n');
