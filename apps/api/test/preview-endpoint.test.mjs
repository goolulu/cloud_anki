import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'file:./dev.db';

test('preview returns a server-generated card', async () => {
  const { default: app } = await import(`../dist/index.js?test=${Date.now()}`);

  const response = await app.request('http://localhost/v1/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      word: 'hello',
      context: 'hello world from cloud anki',
      sourceUrl: 'http://localhost/article',
      lang: 'en',
      page: {
        title: 'Example page',
        hostname: 'localhost',
      },
    }),
  });

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.card.word, 'hello');
  assert.ok(Array.isArray(body.card.synonyms));
  assert.ok(Array.isArray(body.card.collocations));
  assert.ok('audio' in body.card);
});
