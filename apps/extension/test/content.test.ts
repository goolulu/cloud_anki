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

  function getPreviewCard() {
    return document.getElementById('__cloud_anki_preview_card__');
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
    clearSelection();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows a floating preview near the current selection and hides it after the selection clears', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        card: {
          word: 'hello',
          phonetic: '/həˈləʊ/',
          pos: ['interj.'],
          senses: [{ gloss: 'greeting', cn: '你好', examples: ['hello world from cloud anki'] }],
          synonyms: ['hi'],
          collocations: ['hello there'],
          audio: { url: 'https://example.com/audio.mp3', format: 'mp3' },
          source: { url: window.location.href, context: 'hello world from cloud anki' },
          template: 'basic_bilingual',
        },
      }),
    } as Response);

    selectSourceText(0, 5);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await flushAsyncWork();

    const card = getPreviewCard();
    expect(card).toBeDefined();
    expect(card?.textContent).toContain('Cloud Anki Preview');
    expect(card?.textContent).toContain('hello');
    expect(card?.style.position).toBe('fixed');
    expect(card?.style.top).not.toBe('');
    expect(card?.style.left).not.toBe('');

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/v1/preview',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    clearSelection();
    document.dispatchEvent(new Event('selectionchange'));

    expect(getPreviewCard()).toBeNull();
  });

  it('collects the current selection when the preview button is clicked', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          card: {
            word: 'hello',
            phonetic: '/həˈləʊ/',
            pos: ['interj.'],
            senses: [{ gloss: 'greeting', cn: '你好', examples: ['hello world from cloud anki'] }],
            synonyms: ['hi'],
            collocations: ['hello there'],
            audio: { url: 'https://example.com/audio.mp3', format: 'mp3' },
            source: { url: window.location.href, context: 'hello world from cloud anki' },
            template: 'basic_bilingual',
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

    const button = getCollectButton();
    expect(button).toBeDefined();

    button?.click();
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/v1/collect',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const [, request] = fetchMock.mock.calls[0] ?? [];
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
