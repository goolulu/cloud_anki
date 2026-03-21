import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createClient } from '@libsql/client';

async function runSqlFile(client, fileUrl) {
  const sql = await readFile(fileUrl, 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }
}

test('0001 migration backfills card ids for existing collects', async () => {
  const client = createClient({ url: 'file::memory:' });

  try {
    await runSqlFile(client, new URL('../../drizzle/0000_windy_mister_fear.sql', import.meta.url));

    await client.execute(`
      INSERT INTO \`collects\` (
        \`id\`,
        \`word\`,
        \`lang\`,
        \`source_url\`,
        \`context\`,
        \`page_title\`,
        \`hostname\`,
        \`captured_at\`,
        \`created_at\`
      ) VALUES (
        'collect-1',
        'serendipity',
        'en',
        'https://example.com/article',
        'A happy accidental discovery.',
        'Example Article',
        'example.com',
        NULL,
        1710000000000
      )
    `);

    await runSqlFile(client, new URL('../../drizzle/0001_aberrant_obadiah_stane.sql', import.meta.url));

    const collectResult = await client.execute(`SELECT \`card_id\` FROM \`collects\` WHERE \`id\` = 'collect-1'`);
    const cardResult = await client.execute(`SELECT \`id\`, \`word\`, \`lang\` FROM \`cards\` WHERE \`id\` = 'legacy-card:collect-1'`);

    assert.equal(collectResult.rows.length, 1);
    assert.equal(collectResult.rows[0].card_id, 'legacy-card:collect-1');
    assert.equal(cardResult.rows.length, 1);
    assert.equal(cardResult.rows[0].id, 'legacy-card:collect-1');
    assert.equal(cardResult.rows[0].word, 'serendipity');
    assert.equal(cardResult.rows[0].lang, 'en');
  } finally {
    client.close();
  }
});

