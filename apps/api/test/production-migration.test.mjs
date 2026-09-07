import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('production migration entrypoint creates the current schema', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cloud-anki-production-migration-'));
  const databasePath = join(tempDir, 'cloud-anki.db');

  try {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/db/migrate.ts'],
      {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const db = new DatabaseSync(databasePath);
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name);

      assert.ok(tables.includes('cards'));
      assert.ok(tables.includes('collects'));
    } finally {
      db.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
