import assert from 'node:assert/strict';
import test from 'node:test';
import { withTimeout } from '../src/lib/withTimeout.ts';

test('bounded requests retain their values and propagate failures', async () => {
  assert.equal(await withTimeout(Promise.resolve(42), 100), 42);
  await assert.rejects(withTimeout(Promise.reject(new Error('network')), 100), /network/);
});

test('a pending read expires, and late rejection is handled without replaying it', async () => {
  let rejectLate;
  const pending = new Promise((_, reject) => { rejectLate = reject; });
  await assert.rejects(withTimeout(pending, 5), /tardado demasiado/);
  rejectLate(new Error('late network failure'));
  await new Promise((resolve) => setTimeout(resolve, 0));
});
