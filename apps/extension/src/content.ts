type CollectRequest = {
  word: string;
  context: string;
  sourceUrl: string;
  lang: string;
  capturedAt: string;
  page: {
    title: string;
    hostname: string;
  };
};

type SelectionResponse =
  | { ok: true; payload: CollectRequest }
  | { ok: false; error: string };

type RuntimeMessage = {
  type?: string;
};

type CollectResponse = {
  collectId: string;
  cardId: string;
};

type PreviewCard = {
  word: string;
  phonetic?: string;
  pos?: string[];
  senses?: Array<{
    gloss?: string;
    cn?: string;
    examples?: string[];
  }>;
  roots?: {
    root?: string;
    affixes?: string[];
    analysis?: string;
  };
  synonyms?: string[];
  collocations?: string[];
  audio?: {
    url: string;
    format?: string;
  };
  source?: {
    url: string;
    context?: string;
  };
};

type ContentScriptApi = {
  __cloudAnkiInitContentScript__?: () => (() => void) | null;
};

const contentScriptApi = globalThis as typeof globalThis & ContentScriptApi;
const API_BASE_URL = 'http://localhost:8787';

const TOAST_ID = '__cloud_anki_toast__';
const PREVIEW_CARD_ID = '__cloud_anki_preview_card__';
let toastTimer: number | null = null;
let previewCard: HTMLDivElement | null = null;
let cleanupContentScript: (() => void) | null = null;
let previewRequestToken = 0;
let activePreviewKey: string | null = null;

function isCollectResponse(value: unknown): value is CollectResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as Record<string, unknown>;
  return typeof response.collectId === 'string' && typeof response.cardId === 'string';
}

function isPreviewCard(value: unknown): value is PreviewCard {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const card = value as Record<string, unknown>;
  return typeof card.word === 'string';
}

function getPreviewCardFromBody(body: unknown): PreviewCard | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const response = body as Record<string, unknown>;
  const candidate = response.card ?? response.preview;
  return isPreviewCard(candidate) ? candidate : null;
}

async function postCollect(payload: CollectRequest): Promise<CollectResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/collect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Collect request failed with status ${response.status}`;

    throw new Error(message);
  }

  if (!isCollectResponse(body)) {
    throw new Error('Collect request returned an invalid response');
  }

  return body;
}

async function postPreview(payload: CollectRequest): Promise<PreviewCard> {
  const response = await fetch(`${API_BASE_URL}/v1/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Preview request failed with status ${response.status}`;

    throw new Error(message);
  }

  const card = getPreviewCardFromBody(body);
  if (!card) {
    throw new Error('Preview request returned an invalid response');
  }

  return card;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function supportsTextSelection(element: HTMLInputElement): boolean {
  return ['text', 'search', 'url', 'tel', 'password', 'email'].includes(element.type);
}

function getSelectedText(): string {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLTextAreaElement) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? 0;
    return activeElement.value.slice(start, end);
  }

  if (activeElement instanceof HTMLInputElement && supportsTextSelection(activeElement)) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? 0;
    return activeElement.value.slice(start, end);
  }

  return window.getSelection()?.toString() ?? '';
}

function getSelectionContext(fallback: string): string {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLTextAreaElement) {
    return normalizeWhitespace(activeElement.value).slice(0, 500) || fallback;
  }

  if (activeElement instanceof HTMLInputElement && supportsTextSelection(activeElement)) {
    return normalizeWhitespace(activeElement.value).slice(0, 500) || fallback;
  }

  const anchorText = window.getSelection()?.anchorNode?.textContent ?? '';
  return normalizeWhitespace(anchorText).slice(0, 500) || fallback;
}

function getLanguage(): string {
  const lang = normalizeWhitespace(document.documentElement.lang || navigator.language || 'en');
  return lang.slice(0, 10) || 'en';
}

function buildSelectionPayload(): SelectionResponse {
  const word = normalizeWhitespace(getSelectedText());

  if (!word) {
    return { ok: false, error: 'Select text first.' };
  }

  return {
    ok: true,
    payload: {
      word,
      context: getSelectionContext(word),
      sourceUrl: location.href,
      lang: getLanguage(),
      capturedAt: new Date().toISOString(),
      page: {
        title: document.title,
        hostname: location.hostname,
      },
    },
  };
}

function removeToast() {
  document.getElementById(TOAST_ID)?.remove();
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
}

function removePreviewCard() {
  previewCard?.remove();
  previewCard = null;
}

function getSelectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0) as Range & { getBoundingClientRect?: () => DOMRect };
  if (typeof range.getBoundingClientRect !== 'function') {
    return null;
  }

  const rect = range.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

function ensurePreviewCard() {
  if (previewCard) {
    return previewCard;
  }

  previewCard = document.createElement('div');
  previewCard.id = PREVIEW_CARD_ID;
  previewCard.style.position = 'fixed';
  previewCard.style.zIndex = '2147483647';
  previewCard.style.width = '320px';
  previewCard.style.maxWidth = 'calc(100vw - 16px)';
  previewCard.style.padding = '12px';
  previewCard.style.border = '1px solid #d1d5db';
  previewCard.style.borderRadius = '12px';
  previewCard.style.background = '#ffffff';
  previewCard.style.color = '#111827';
  previewCard.style.font = '13px/1.5 system-ui, sans-serif';
  previewCard.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.2)';
  previewCard.style.whiteSpace = 'normal';

  document.documentElement.appendChild(previewCard);
  return previewCard;
}

function positionPreviewCard(rect: DOMRect) {
  const card = ensurePreviewCard();
  card.style.top = `${Math.max(rect.bottom + 8, 8)}px`;
  card.style.left = `${Math.max(rect.left, 8)}px`;
}

function renderPreviewState(rect: DOMRect, body: string) {
  const card = ensurePreviewCard();
  positionPreviewCard(rect);
  card.textContent = body;
}

function joinNonEmpty(parts: Array<string | undefined>): string {
  return parts.filter((value): value is string => Boolean(value && value.trim())).join(' / ');
}

function renderPreviewCard(rect: DOMRect, cardData: PreviewCard) {
  const card = ensurePreviewCard();
  positionPreviewCard(rect);

  const firstSense = cardData.senses?.[0];
  const gloss = joinNonEmpty([firstSense?.gloss, firstSense?.cn]);
  const example = firstSense?.examples?.[0] ?? cardData.source?.context ?? '';
  const roots = joinNonEmpty([
    cardData.roots?.root,
    cardData.roots?.analysis,
    cardData.roots?.affixes?.length ? cardData.roots.affixes.join(', ') : undefined,
  ]);
  const synonyms = cardData.synonyms?.join(', ') ?? '';
  const collocations = cardData.collocations?.join(', ') ?? '';
  const audio = cardData.audio?.url ? 'Audio available' : '';

  const lines = [
    cardData.word,
    cardData.phonetic ?? '',
    gloss,
    example,
    roots,
    synonyms,
    collocations,
    audio,
  ].filter(Boolean);

  card.textContent = '';

  for (const line of lines) {
    const row = document.createElement('div');
    row.textContent = line;
    card.appendChild(row);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Collect';
  button.style.marginTop = '10px';
  button.style.padding = '8px 12px';
  button.style.border = '0';
  button.style.borderRadius = '999px';
  button.style.background = '#111827';
  button.style.color = '#ffffff';
  button.style.font = '13px/1.2 system-ui, sans-serif';
  button.style.cursor = 'pointer';
  button.addEventListener('click', () => {
    void collectCurrentSelection();
  });
  card.appendChild(button);
}

function buildPreviewKey(payload: CollectRequest): string {
  return `${payload.word}\n${payload.context}\n${payload.sourceUrl}`;
}

async function syncPreviewCard() {
  const selection = buildSelectionPayload();
  const rect = getSelectionRect();

  if (!selection.ok || !rect) {
    previewRequestToken += 1;
    activePreviewKey = null;
    removePreviewCard();
    return;
  }

  const previewKey = buildPreviewKey(selection.payload);
  if (previewKey === activePreviewKey && previewCard) {
    positionPreviewCard(rect);
    return;
  }

  activePreviewKey = previewKey;

  const requestToken = ++previewRequestToken;
  renderPreviewState(rect, 'Loading preview');

  try {
    const card = await postPreview(selection.payload);
    if (requestToken !== previewRequestToken) {
      return;
    }

    const latestRect = getSelectionRect();
    if (!latestRect) {
      activePreviewKey = null;
      removePreviewCard();
      return;
    }

    renderPreviewCard(latestRect, card);
  } catch (error) {
    if (requestToken !== previewRequestToken) {
      return;
    }

    activePreviewKey = null;
    removePreviewCard();
    showToast(error instanceof Error ? error.message : 'Failed to load preview.', false);
  }
}

async function collectCurrentSelection() {
  const selection = buildSelectionPayload();

  if (!selection.ok) {
    showToast(selection.error, false);
    return;
  }

  try {
    await postCollect(selection.payload);
    removePreviewCard();
    showToast(`Saved “${selection.payload.word}” to Cloud Anki.`, true);
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Failed to collect selection.',
      false,
    );
  }
}

function showToast(message: string, ok: boolean) {
  removeToast();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.top = '16px';
  toast.style.right = '16px';
  toast.style.zIndex = '2147483647';
  toast.style.maxWidth = '320px';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '10px';
  toast.style.background = ok ? '#166534' : '#991b1b';
  toast.style.color = '#ffffff';
  toast.style.font = '13px/1.4 system-ui, sans-serif';
  toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.2)';

  document.documentElement.appendChild(toast);

  toastTimer = window.setTimeout(() => {
    removeToast();
  }, 2500);
}

function initContentScript() {
  if (cleanupContentScript) {
    return cleanupContentScript;
  }

  const handleSelectionChange = () => {
    void syncPreviewCard();
  };

  const handleMouseUp = () => {
    void syncPreviewCard();
  };

  const handleRuntimeMessage = (message: RuntimeMessage) => {
    if (message.type === 'cloud-anki:collect-selection') {
      void collectCurrentSelection();
    }
  };

  document.addEventListener('selectionchange', handleSelectionChange);
  document.addEventListener('mouseup', handleMouseUp);
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  cleanupContentScript = () => {
    previewRequestToken += 1;
    activePreviewKey = null;
    document.removeEventListener('selectionchange', handleSelectionChange);
    document.removeEventListener('mouseup', handleMouseUp);
    chrome.runtime.onMessage.removeListener?.(handleRuntimeMessage);
    removePreviewCard();
    removeToast();
    cleanupContentScript = null;
  };

  return cleanupContentScript;
}

contentScriptApi.__cloudAnkiInitContentScript__ = initContentScript;

initContentScript();
