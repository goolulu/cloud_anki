import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'file:./apps/api/dev.db';

test('tsv export uses tab-separated-values content type', async () => {
  const { default: app } = await import(`../dist/index.js?test=${Date.now()}`);

  const response = await app.request('http://localhost/v1/exports/latest/download?format=tsv');

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/tab-separated-values; charset=utf-8');
});
