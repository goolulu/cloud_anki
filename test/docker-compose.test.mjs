import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('production compose defines healthy API and web services with persistent data', async () => {
  const compose = await read('compose.yaml');

  assert.match(compose, /^services:/m);
  assert.match(compose, /^  api:/m);
  assert.match(compose, /^  web:/m);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /cloud-anki-data:\/app\/data/);
  assert.match(compose, /^volumes:\s*\n  cloud-anki-data:/m);
  assert.match(compose, /OPENAI_API_KEY/);
});

test('API image migrates the database before starting the compiled server', async () => {
  const dockerfile = await read('apps/api/Dockerfile');

  assert.match(dockerfile, /node apps\/api\/dist\/db\/migrate\.js/);
  assert.match(dockerfile, /node apps\/api\/dist\/index\.js/);
  assert.match(dockerfile, /HEALTHCHECK/);
});

test('web image serves the production bundle and proxies API requests', async () => {
  const [dockerfile, nginx] = await Promise.all([
    read('apps/web/Dockerfile'),
    read('apps/web/nginx.conf'),
  ]);

  assert.match(dockerfile, /npm run build -w @cloud-anki\/web/);
  assert.match(dockerfile, /nginx/);
  assert.match(nginx, /proxy_pass http:\/\/api:8787/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
});

test('example environment documents production settings without real secrets', async () => {
  const example = await read('.env.example');

  assert.match(example, /^OPENAI_API_KEY=$/m);
  assert.match(example, /^OPENAI_MODEL=/m);
  assert.doesNotMatch(example, /sk-[A-Za-z0-9]/);
});
