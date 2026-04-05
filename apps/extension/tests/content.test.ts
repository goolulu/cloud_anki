import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type RuntimeMessageListener = (
  message: { type?: string },
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => void;

const fetchMock = vi.fn();
let runtimeMessageListener: RuntimeMessageListener | undefined;
let cleanup: (() => void) | undefined;

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

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  await import('../src/content.ts');
  cleanup = (
    globalThis as typeof globalThis & {
      __cloudAnkiInitContentScript__?: () => (() => void) | null;
    }
  ).__cloudAnkiInitContentScript__?.() ?? undefined;
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.documentElement.innerHTML = '<head></head><body></body>';
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
    expect(document.documentElement.textContent).toContain('Saved "serendipity" to Cloud Anki.');
  });
});
