import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CollectRequestSchema, NormalizedCardSchema, ExportRowSchema } from '@cloud-anki/shared';

import { makeDb } from './db/client.js';
import { collects, cards } from './db/schema.js';
import { MockDictionaryProvider } from './services/dictionary.js';

const envSchema = z.object({
  DATABASE_URL: z.string().default('file:./dev.db'),
  PORT: z.coerce.number().int().positive().default(8787),
});

type Env = z.infer<typeof envSchema>;

function readEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Keep it simple for MVP; fail fast.
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

const env = readEnv();
const db = makeDb(env.DATABASE_URL);
const dictionary = new MockDictionaryProvider();

const app = new Hono();

async function buildNormalizedCard(body: unknown) {
  const parsed = CollectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: { error: 'invalid_body', details: parsed.error.flatten() },
      status: 400 as const,
    };
  }

  const req = parsed.data;
  const card = await dictionary.analyze({
    word: req.word,
    context: req.context ?? '',
    sourceUrl: req.sourceUrl,
    lang: req.lang,
  });

  const cardParsed = NormalizedCardSchema.safeParse(card);
  if (!cardParsed.success) {
    return {
      ok: false as const,
      response: { error: 'provider_invalid_card', details: cardParsed.error.flatten() },
      status: 500 as const,
    };
  }

  return {
    ok: true as const,
    request: req,
    card: cardParsed.data,
  };
}

// Basic CORS for web + extension
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  c.header('Access-Control-Expose-Headers', 'Content-Disposition');

  if (c.req.method === 'OPTIONS') {
    return c.text('');
  }

  return next();
});

app.get('/health', (c) => c.json({ ok: true }));

app.post('/v1/preview', async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await buildNormalizedCard(body);

  if (!result.ok) {
    return c.json(result.response, result.status);
  }

  return c.json({ card: result.card });
});

app.post('/v1/collect', async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await buildNormalizedCard(body);
  if (!result.ok) {
    return c.json(result.response, result.status);
  }

  const now = Date.now();
  const req = result.request;
  const cardParsed = result.card;

  const cardId = cardParsed.id ?? nanoid();

  await db.insert(cards).values({
    id: cardId,
    word: req.word,
    lang: req.lang,
    normalizedJson: JSON.stringify({ ...cardParsed, id: cardId }),
    createdAt: new Date(now),
  });

  const collectId = nanoid();

  await db.insert(collects).values({
    id: collectId,
    cardId,
    word: req.word,
    lang: req.lang,
    sourceUrl: req.sourceUrl,
    context: req.context ?? '',
    pageTitle: req.page?.title ?? '',
    hostname: req.page?.hostname ?? '',
    capturedAt: req.capturedAt ? new Date(req.capturedAt) : null,
    createdAt: new Date(now),
  });

  return c.json({ collectId, cardId });
});

app.get('/v1/cards/:id', async (c) => {
  const id = c.req.param('id');
  const rows = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  const row = rows[0];
  if (!row) return c.json({ error: 'not_found' }, 404);

  const card = JSON.parse(row.normalizedJson);
  return c.json({ card });
});

app.get('/v1/collects', async (c) => {
  const rows = await db.select().from(collects).orderBy(collects.createdAt);
  return c.json({ collects: rows });
});

app.get('/v1/exports/:id/download', async (c) => {
  const id = c.req.param('id');
  const format = c.req.query('format') ?? 'tsv';

  if (id !== 'latest') {
    return c.json({ error: 'unsupported_export_id' }, 400);
  }

  const collectRows = await db.select().from(collects).orderBy(collects.createdAt);
  const cardRows = await db.select().from(cards);

  const cardById = new Map<string, any>();
  for (const row of cardRows) {
    try {
      const card = JSON.parse(row.normalizedJson);
      cardById.set(row.id, card);
    } catch {
      // Skip malformed rows for MVP
    }
  }

  const rows: string[] = [];
  const header = ['Front', 'Back', 'Example', 'Phonetic', 'Roots', 'SourceUrl', 'Context'];
  rows.push(header.join(format === 'csv' ? ',' : '\t'));

  for (const collect of collectRows) {
    const card = cardById.get(collect.cardId) ?? null;

    let front = collect.word;
    let back = '';
    let example = collect.context ?? '';
    let phonetic = '';
    let roots = '';
    let sourceUrl = collect.sourceUrl ?? '';
    let context = collect.context ?? '';

    if (card) {
      front = card.word ?? front;

      if (Array.isArray(card.pos) && card.pos.length > 0) {
        back += card.pos.join(', ') + ' ';
      }

      if (Array.isArray(card.senses) && card.senses.length > 0) {
        const first = card.senses[0];
        const glossParts: string[] = [];
        if (first.gloss) glossParts.push(String(first.gloss));
        if (first.cn) glossParts.push(String(first.cn));
        if (glossParts.length > 0) {
          back += glossParts.join(' / ');
        }
        if (!example && Array.isArray(first.examples) && first.examples.length > 0) {
          example = String(first.examples[0] ?? '');
        }
      }

      phonetic = card.phonetic ?? '';

      if (card.roots) {
        const parts: string[] = [];
        if (card.roots.root) parts.push(`root: ${card.roots.root}`);
        if (Array.isArray(card.roots.affixes) && card.roots.affixes.length > 0) {
          parts.push(`affixes: ${card.roots.affixes.join(', ')}`);
        }
        if (card.roots.analysis) parts.push(`analysis: ${card.roots.analysis}`);
        roots = parts.join(' | ');
      }

      if (card.source) {
        sourceUrl = card.source.url ?? sourceUrl;
        if (!context && card.source.context) {
          context = card.source.context;
        }
      }
    }

    const rowObj = {
      Front: front,
      Back: back,
      Example: example,
      Phonetic: phonetic,
      Roots: roots,
      SourceUrl: sourceUrl,
      Context: context,
    };

    const parsed = ExportRowSchema.safeParse(rowObj);
    if (!parsed.success) continue;

    const safe = parsed.data;

    const sep = format === 'csv' ? ',' : '\t';
    const escape = (value: string) => {
      const v = value ?? '';
      if (format === 'csv') {
        if (/[",\n]/.test(v)) {
          return '"' + v.replace(/"/g, '""') + '"';
        }
        return v;
      }
      return v.replace(/\t/g, ' ');
    };

    rows.push([
      safe.Front,
      safe.Back,
      safe.Example,
      safe.Phonetic,
      safe.Roots,
      safe.SourceUrl,
      safe.Context,
    ].map(escape).join(sep));
  }

  const text = rows.join('\n');
  const filename = format === 'csv' ? 'cloud-anki-export.csv' : 'cloud-anki-export.tsv';
  const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'text/tab-separated-values; charset=utf-8';

  return new Response(text, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

export default app;

// Node entrypoint
const isEntrypoint = (() => {
  // Works on Windows + POSIX, with TS loaders that may change argv[1] formatting.
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return import.meta.url === pathToFileURL(resolve(argv1)).href;
})();

if (isEntrypoint) {
  const { serve } = await import('@hono/node-server');

  serve({
    fetch: app.fetch,
    port: env.PORT,
  });

  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.PORT}`);
}
