type SelectionResponse =
  | { ok: true; payload: CollectRequest }
  | { ok: false; error: string };

type CollectRequest = {
  word: string;
  sourceUrl: string;
  context?: string;
  lang?: string;
  capturedAt?: string;
  page?: {
    title?: string;
    hostname?: string;
  };
};

type NormalizedCardSense = {
  gloss?: string;
  cn?: string;
  examples?: string[];
};

type NormalizedCard = {
  id?: string;
  word: string;
  phonetic?: string;
  pos?: string[];
  senses?: NormalizedCardSense[];
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
  template?: string;
  createdAt?: string;
};

type RuntimeMessage = {
  type?: string;
};

const TOAST_ID = '__cloud_anki_toast__';
const PREVIEW_CARD_ID = '__cloud_anki_preview_card__';
const API_BASE_URL = 'http://localhost:8787';
let toastTimer: number | null = null;
let previewCard: HTMLDivElement | null = null;
let cleanupContentScript: (() => void) | null = null;
let previewRequestToken = 0;
let activePreviewKey: string | null = null;

type CollectResponse = {
  collectId: string;
  cardId: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isCollectResponse(value: unknown): value is CollectResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as Record<string, unknown>;
  return typeof response.collectId === 'string' && typeof response.cardId === 'string';
}

function isPreviewCard(value: unknown): value is NormalizedCard {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const card = value as Record<string, unknown>;
  return typeof card.word === 'string';
}

function getPreviewCardFromBody(body: unknown): NormalizedCard | null {
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

async function postPreview(payload: CollectRequest): Promise<NormalizedCard> {
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
  previewCard.style.width = '360px';
  previewCard.style.maxWidth = 'min(360px, calc(100vw - 16px))';
  previewCard.style.padding = '16px';
  previewCard.style.border = '1px solid rgba(248, 113, 113, 0.22)';
  previewCard.style.borderRadius = '18px';
  previewCard.style.background =
    'linear-gradient(180deg, rgba(27, 27, 31, 0.98) 0%, rgba(15, 15, 18, 0.98) 100%)';
  previewCard.style.color = '#f5f5f4';
  previewCard.style.fontFamily = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  previewCard.style.fontSize = '13px';
  previewCard.style.lineHeight = '1.45';
  previewCard.style.boxShadow =
    '0 22px 60px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.04)';
  previewCard.style.backdropFilter = 'blur(10px)';
  previewCard.style.whiteSpace = 'normal';
  previewCard.style.overflow = 'hidden';

  document.documentElement.appendChild(previewCard);
  return previewCard;
}

function positionPreviewCard(rect: DOMRect) {
  const card = ensurePreviewCard();
  const margin = 8;
  const preferredTop = rect.bottom + margin;
  const preferredLeft = rect.left;
  const maxLeft = Math.max(window.innerWidth - card.offsetWidth - margin, margin);
  const maxTop = Math.max(window.innerHeight - card.offsetHeight - margin, margin);

  card.style.left = `${Math.min(Math.max(preferredLeft, margin), maxLeft)}px`;
  card.style.top = `${Math.min(Math.max(preferredTop, margin), maxTop)}px`;
}

function createText(tag: keyof HTMLElementTagNameMap, text: string, styles: Partial<CSSStyleDeclaration>) {
  const element = document.createElement(tag);
  element.textContent = text;
  Object.assign(element.style, styles);
  return element;
}

function createSection(label: string, value: string) {
  const section = document.createElement('section');
  section.style.display = 'grid';
  section.style.gap = '6px';
  section.style.paddingTop = '12px';
  section.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';

  section.append(
    createText('div', label, {
      fontSize: '10px',
      fontWeight: '700',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: 'rgba(252, 165, 165, 0.78)',
    }),
    createText('div', value, {
      color: 'rgba(245, 245, 244, 0.92)',
    }),
  );

  return section;
}

function createMetaPill(text: string, tone: 'accent' | 'muted' = 'muted') {
  const pill = document.createElement('span');
  pill.textContent = text;
  pill.style.display = 'inline-flex';
  pill.style.alignItems = 'center';
  pill.style.padding = '4px 10px';
  pill.style.borderRadius = '999px';
  pill.style.fontSize = '11px';
  pill.style.fontWeight = '600';
  pill.style.letterSpacing = '0.02em';
  pill.style.border =
    tone === 'accent' ? '1px solid rgba(248, 113, 113, 0.38)' : '1px solid rgba(255, 255, 255, 0.08)';
  pill.style.background =
    tone === 'accent' ? 'rgba(153, 27, 27, 0.34)' : 'rgba(255, 255, 255, 0.04)';
  pill.style.color = tone === 'accent' ? '#fecaca' : 'rgba(255, 255, 255, 0.76)';
  return pill;
}

function joinNonEmpty(parts: Array<string | undefined>) {
  return parts
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' / ');
}

function renderPreviewState(rect: DOMRect, message: string) {
  const card = ensurePreviewCard();
  card.replaceChildren();

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '14px';
  header.append(
    createText('div', 'Cloud Anki Preview', {
      fontSize: '11px',
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'rgba(252, 165, 165, 0.72)',
      fontWeight: '700',
    }),
    createMetaPill('Loading', 'accent'),
  );

  const body = createText('div', message, {
    color: 'rgba(255, 255, 255, 0.82)',
  });

  card.append(header, body);
  positionPreviewCard(rect);
}

function renderPreviewCard(rect: DOMRect, cardData: NormalizedCard) {
  const card = ensurePreviewCard();
  card.replaceChildren();

  const firstSense = cardData.senses?.[0];
  const gloss = joinNonEmpty([firstSense?.gloss, firstSense?.cn]);
  const example = firstSense?.examples?.[0] ?? cardData.source?.context ?? '';
  const roots = joinNonEmpty([
    cardData.roots?.root,
    cardData.roots?.analysis,
    cardData.roots?.affixes?.length ? cardData.roots.affixes.join(', ') : undefined,
  ]);

  const header = document.createElement('div');
  header.style.display = 'grid';
  header.style.gap = '10px';

  const eyebrow = document.createElement('div');
  eyebrow.style.display = 'flex';
  eyebrow.style.alignItems = 'center';
  eyebrow.style.justifyContent = 'space-between';

  const eyebrowLabel = createText('div', 'Cloud Anki Preview', {
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'rgba(252, 165, 165, 0.72)',
    fontWeight: '700',
  });

  const confidence = createMetaPill(cardData.template ?? 'basic_bilingual', 'accent');
  eyebrow.append(eyebrowLabel, confidence);

  const title = createText('div', cardData.word, {
    fontSize: '28px',
    fontWeight: '800',
    color: '#fafaf9',
    letterSpacing: '-0.03em',
  });

  const metaRow = document.createElement('div');
  metaRow.style.display = 'flex';
  metaRow.style.flexWrap = 'wrap';
  metaRow.style.gap = '8px';

  if (cardData.phonetic) {
    metaRow.append(createMetaPill(cardData.phonetic));
  }

  if (cardData.pos?.length) {
    metaRow.append(createMetaPill(cardData.pos.join(' · ')));
  }

  if (cardData.audio?.url) {
    metaRow.append(createMetaPill('Audio ready'));
  }

  header.append(eyebrow, title);
  if (metaRow.childElementCount > 0) {
    header.append(metaRow);
  }

  card.append(header);

  if (gloss) {
    card.append(createSection('Meaning', gloss));
  }

  if (example) {
    card.append(createSection('Context', example));
  }

  if (roots) {
    card.append(createSection('Roots', roots));
  }

  if (cardData.synonyms?.length) {
    card.append(createSection('Synonyms', cardData.synonyms.join(', ')));
  }

  if (cardData.collocations?.length) {
    card.append(createSection('Collocations', cardData.collocations.join(', ')));
  }

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.alignItems = 'center';
  footer.style.justifyContent = 'space-between';
  footer.style.gap = '12px';
  footer.style.marginTop = '16px';
  footer.style.paddingTop = '14px';
  footer.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';

  const source = createText('div', cardData.source?.url ? new URL(cardData.source.url).hostname : 'Local page', {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.56)',
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Collect';
  button.style.border = '0';
  button.style.borderRadius = '999px';
  button.style.padding = '10px 16px';
  button.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
  button.style.color = '#fff7ed';
  button.style.font = '600 13px/1 "Segoe UI", "PingFang SC", sans-serif';
  button.style.cursor = 'pointer';
  button.style.boxShadow = '0 10px 24px rgba(220, 38, 38, 0.28)';
  button.addEventListener('click', () => {
    void collectCurrentSelection();
  });

  footer.append(source, button);
  card.append(footer);

  positionPreviewCard(rect);
}

function buildPreviewKey(payload: CollectRequest) {
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
  renderPreviewState(rect, 'Building a quick preview from the current selection.');

  try {
    const cardData = await postPreview(selection.payload);
    if (requestToken !== previewRequestToken) {
      return;
    }

    const latestRect = getSelectionRect();
    if (!latestRect) {
      activePreviewKey = null;
      removePreviewCard();
      return;
    }

    renderPreviewCard(latestRect, cardData);
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
    showToast(`Saved "${selection.payload.word}" to Cloud Anki.`, true);
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
  toast.style.font = '13px/1.4 "Segoe UI", "PingFang SC", sans-serif';
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

(
  globalThis as typeof globalThis & {
    __cloudAnkiInitContentScript__?: typeof initContentScript;
  }
).__cloudAnkiInitContentScript__ = initContentScript;

initContentScript();
