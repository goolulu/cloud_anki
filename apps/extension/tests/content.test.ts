import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type RuntimeMessageListener = (
  message: { type?: string },
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => void;

const fetchMock = vi.fn();
let runtimeMessageListener: RuntimeMessageListener | undefined;
let cleanup: (() => void) | undefined;

function createPreviewCardResponse() {
  return {
    card: {
      word: 'serendipity',
      phonetic: '/ˌserənˈdɪpəti/',
      pos: ['noun'],
      senses: [
        {
          gloss: 'happy accident',
          cn: '意外发现珍宝',
          examples: ['serendipity in context'],
        },
      ],
      source: {
        url: window.location.href,
        context: 'serendipity in context',
      },
    },
  };
}

function createDeferredResponse(body: unknown) {
  let resolveResponse: ((value: Response) => void) | undefined;

  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  return {
    promise,
    resolve() {
      resolveResponse?.(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    },
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));

  runtimeMessageListener = undefined;

  (globalThis as any).chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener: RuntimeMessageListener) => {
          runtimeMessageListener = listener;
        }),
        removeListener: vi.fn(),
      },
    },
  };

  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);

  document.documentElement.innerHTML = '<head></head><body><p id="text">serendipity in context</p></body>';
  document.documentElement.lang = 'en';
  document.title = 'Example Article';
  window.history.replaceState({}, '', '/article');

  const textNode = document.getElementById('text')?.firstChild;
  if (!textNode) {
    throw new Error('Missing text node');
  }

  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 'serendipity'.length);
  Object.assign(range, {
    getBoundingClientRect: () => new DOMRect(80, 40, 24, 16),
  });

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  const module = await import('../src/content.ts');
  void module;
  cleanup = (
    globalThis as typeof globalThis & { __cloudAnkiInitContentScript__?: () => (() => void) | null }
  ).__cloudAnkiInitContentScript__?.() ?? undefined;
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.documentElement.innerHTML = '<head></head><body></body>';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('shows a loading state and renders a server-generated preview card for the current selection', async () => {
  const previewRequest = createDeferredResponse(createPreviewCardResponse());
  fetchMock.mockReturnValueOnce(previewRequest.promise);

  document.dispatchEvent(new Event('selectionchange'));

  expect(document.documentElement.textContent).toContain('Loading preview');

  previewRequest.resolve();
  await Promise.resolve();
  await Promise.resolve();

  await vi.waitFor(() => {
    expect(document.documentElement.textContent).toContain('serendipity');
    expect(document.documentElement.textContent).toContain('/ˌserənˈdɪpəti/');
    expect(document.documentElement.textContent).toContain('happy accident / 意外发现珍宝');
    expect(document.documentElement.textContent).toContain('serendipity in context');
    expect(document.documentElement.textContent).toContain('Collect');
  });
});

test('collects the current selection from the rendered preview card', async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify(createPreviewCardResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ collectId: 'collect-1', cardId: 'card-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

  document.dispatchEvent(new Event('selectionchange'));

  await vi.waitFor(() => {
    expect(document.documentElement.textContent).toContain('Collect');
    expect(document.documentElement.textContent).toContain('happy accident / 意外发现珍宝');
  });

  const button = Array.from(document.querySelectorAll('button')).find(
    (element) => element.textContent === 'Collect',
  ) as HTMLButtonElement | undefined;

  button?.click();
  await Promise.resolve();
  await Promise.resolve();

  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8787/v1/collect',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  await vi.waitFor(() => {
    expect(document.documentElement.textContent).toContain('Saved “serendipity” to Cloud Anki.');
  });
});

test('collects the current selection when asked by the background script', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ collectId: 'collect-1', cardId: 'card-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  runtimeMessageListener?.({ type: 'cloud-anki:collect-selection' }, {}, () => undefined);
  await Promise.resolve();
  await Promise.resolve();

  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/collect',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  await vi.waitFor(() => {
    expect(document.documentElement.textContent).toContain('Saved “serendipity” to Cloud Anki.');
  });
});
