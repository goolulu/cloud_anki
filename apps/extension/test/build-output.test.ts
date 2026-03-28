import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('extension build output', () => {
  it('emits a content script without top-level ESM syntax', () => {
    execFileSync('npm', ['run', 'build'], {
      cwd: extensionDir,
      stdio: 'pipe',
      shell: true,
    });

    const contentScript = readFileSync(resolve(extensionDir, 'dist/content.js'), 'utf8');

    expect(contentScript).not.toMatch(/^import\s/m);
    expect(contentScript).not.toMatch(/^export\s/m);
  });
});
