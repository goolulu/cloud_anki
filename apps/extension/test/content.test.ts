import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RuntimeListener = (message: { type?: string }, sender: unknown, sendResponse: (response?: unknown) => void) => unknown;

describe('content script', () => {
  let cleanup: (() => void) | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  function installChromeMock() {
    (globalThis as typeof globalThis & { chrome: unknown }).chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((_listener: RuntimeListener) => undefined),
          removeListener: vi.fn(),
        },
      },
    };
  }

  function selectSourceText(start: number, end: number) {
    const textNode = document.getElementById('source')?.firstChild;
    if (!textNode) {
      throw new Error('Missing source text node');
    }

    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    Object.assign(range, {
      getBoundingClientRect: () => new DOMRect(80, 40, 24, 16),
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
  }

  function getCollectButton() {
    return Array.from(document.querySelectorAll('button')).find(
      (element) => element.textContent === 'Collect',
    ) as HTMLButtonElement | undefined;
  }

  async function flushAsyncWork() {
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));

    document.body.innerHTML = '<main><p id="source">hello world from cloud anki</p></main>';
    document.documentElement.lang = 'en';
    document.title = 'Example page';
    window.history.replaceState({}, '', '/article');

    installChromeMock();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const module = await import('../src/content.ts');
    void module;
    cleanup = (
      globalThis as typeof globalThis & { __cloudAnkiInitContentScript__?: () => (() => void) | null }
    ).__cloudAnkiInitContentScript__?.() ?? undefined;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    clearSelection();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows a preview card for the current selection and hides it after the selection clears', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        card: {
          word: 'hello',
          phonetic: '/həˈləʊ/',
          senses: [
            {
              gloss: 'used as a greeting',
              cn: '你好',
              examples: ['hello world from cloud anki'],
            },
          ],
          roots: {
            root: 'hol',
            affixes: [],
            analysis: 'greeting root',
          },
          synonyms: ['hi'],
          collocations: ['hello there'],
          audio: {
            url: 'https://example.com/hello.mp3',
            format: 'mp3',
          },
        },
      }),
    } as Response);

    selectSourceText(0, 5);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/v1/preview',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await vi.waitFor(() => {
      expect(document.documentElement.textContent).toContain('/həˈləʊ/');
      expect(document.documentElement.textContent).toContain('used as a greeting');
      expect(document.documentElement.textContent).toContain('你好');
      expect(document.documentElement.textContent).toContain('hello there');
      expect(document.documentElement.textContent).toContain('Collect');
    });

    clearSelection();
    document.dispatchEvent(new Event('selectionchange'));

    await vi.waitFor(() => {
      expect(document.documentElement.textContent).not.toContain('used as a greeting');
    });
  });

  it('collects the current selection when the preview card Collect button is clicked', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          card: {
            word: 'hello',
            phonetic: '/həˈləʊ/',
            senses: [
              {
                gloss: 'used as a greeting',
                cn: '你好',
                examples: ['hello world from cloud anki'],
              },
            ],
            roots: {
              root: 'hol',
              affixes: [],
              analysis: 'greeting root',
            },
            synonyms: ['hi'],
            collocations: ['hello there'],
            audio: {
              url: 'https://example.com/hello.mp3',
              format: 'mp3',
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ collectId: 'collect-1', cardId: 'card-1' }),
      } as Response);

    selectSourceText(0, 5);
    document.dispatchEvent(new Event('selectionchange'));
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(document.documentElement.textContent).toContain('used as a greeting');
    });

    const button = getCollectButton();
    expect(button).toBeDefined();

    button?.click();
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8787/v1/collect',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const [, request] = fetchMock.mock.calls[1] ?? [];
    const payload = JSON.parse(String((request as RequestInit | undefined)?.body));

    expect(payload).toMatchObject({
      word: 'hello',
      sourceUrl: window.location.href,
      lang: 'en',
      page: {
        title: 'Example page',
        hostname: window.location.hostname,
      },
    });

    await vi.waitFor(() => {
      expect(document.documentElement.textContent).toContain('Saved');
    });
  });
});
