import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const migration0000 = await readFile(resolve(testDir, '../drizzle/0000_windy_mister_fear.sql'), 'utf8');
const migration0001 = await readFile(resolve(testDir, '../drizzle/0001_aberrant_obadiah_stane.sql'), 'utf8');

function legacyCardIdFor(collectId) {
  return `legacy-card:${collectId}`;
}

test('0001 migration safely backfills card_id for existing collects', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cloud-anki-api-0001-'));
  const dbPath = join(tempDir, 'legacy.sqlite');
  const db = new DatabaseSync(dbPath);

  try {
    db.exec(migration0000);

    db.prepare(
      `INSERT INTO collects (
        id,
        word,
        lang,
        source_url,
        context,
        page_title,
        hostname,
        captured_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'legacy-collect-1',
      'serendipity',
      'en',
      'https://example.com/article',
      'It was pure serendipity.',
      'Example title',
      'example.com',
      1710000000000,
      1710000000000,
    );

    db.exec(migration0001);

    const columns = db.prepare("PRAGMA table_info('collects')").all();
    const cardIdColumn = columns.find((column) => column.name === 'card_id');

    assert.ok(cardIdColumn, 'expected collects.card_id to exist after migration');
    assert.equal(cardIdColumn.notnull, 1, 'expected collects.card_id to remain NOT NULL');
    assert.equal(cardIdColumn.dflt_value, null, 'expected collects.card_id to have no final default');

    const collect = db.prepare('SELECT * FROM collects WHERE id = ?').get('legacy-collect-1');

    assert.equal(collect.word, 'serendipity');
    assert.equal(collect.card_id, legacyCardIdFor('legacy-collect-1'));

    const card = db
      .prepare('SELECT id, word, lang, normalized_json, created_at FROM cards WHERE id = ?')
      .get(collect.card_id);

    assert.ok(card, 'expected migration to create a matching cards row for legacy collect');
    assert.equal(card.word, 'serendipity');
    assert.equal(card.lang, 'en');
    assert.equal(card.created_at, 1710000000000);

    const normalizedCard = JSON.parse(card.normalized_json);

    assert.equal(normalizedCard.id, collect.card_id);
    assert.equal(normalizedCard.word, 'serendipity');
    assert.equal(normalizedCard.source.url, 'https://example.com/article');
    assert.equal(normalizedCard.source.context, 'It was pure serendipity.');
  } finally {
    db.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
