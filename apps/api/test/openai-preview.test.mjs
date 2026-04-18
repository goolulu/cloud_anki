import test from 'node:test';
import assert from 'node:assert/strict';

function createSseResponse(events) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

test('preview uses OpenAI SDK streaming when credentials are configured', async () => {
  process.env.DATABASE_URL = 'file:./dev.db';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = 'https://api.openai.test/v1';
  process.env.OPENAI_MODEL = 'gpt-4.1-mini';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.openai.test/v1/chat/completions');
    assert.equal(init?.method, 'POST');

    return createSseResponse([
      {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-4.1-mini',
        choices: [
          {
            index: 0,
            delta: {
              content:
                '{"word":"hello","phonetic":"/həˈloʊ/","pos":["interjection"],"senses":[{"gloss":"used as a greeting",',
            },
          },
        ],
      },
      {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-4.1-mini',
        choices: [
          {
            index: 0,
            delta: {
              content:
                '"cn":"你好","examples":["hello world from cloud anki"]}],"roots":{"root":"","affixes":[],"analysis":""},',
            },
          },
        ],
      },
      {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-4.1-mini',
        choices: [
          {
            index: 0,
            delta: {
              content: '"synonyms":["hi"],"collocations":["hello there"]}',
            },
          },
        ],
      },
    ]);
  };

  try {
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
    assert.equal(body.card.senses[0].cn, '你好');
    assert.deepEqual(body.card.synonyms, ['hi']);
    assert.deepEqual(body.card.collocations, ['hello there']);
    assert.equal(body.card.source.url, 'http://localhost/article');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
  }
});
