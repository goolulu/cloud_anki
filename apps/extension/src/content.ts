import { postCollect } from './api.js';
import type { CollectRequest } from '@cloud-anki/shared';

type SelectionResponse =
  | { ok: true; payload: CollectRequest }
  | { ok: false; error: string };

type RuntimeMessage = {
  type?: string;
};

const TOAST_ID = '__cloud_anki_toast__';
const COLLECT_BUTTON_ID = '__cloud_anki_collect_button__';
let toastTimer: number | null = null;
let collectButton: HTMLButtonElement | null = null;
let cleanupContentScript: (() => void) | null = null;

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

function removeCollectButton() {
  collectButton?.remove();
  collectButton = null;
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

function ensureCollectButton() {
  if (collectButton) {
    return collectButton;
  }

  collectButton = document.createElement('button');
  collectButton.id = COLLECT_BUTTON_ID;
  collectButton.type = 'button';
  collectButton.textContent = 'Collect';
  collectButton.style.position = 'fixed';
  collectButton.style.zIndex = '2147483647';
  collectButton.style.padding = '8px 12px';
  collectButton.style.border = '0';
  collectButton.style.borderRadius = '999px';
  collectButton.style.background = '#111827';
  collectButton.style.color = '#ffffff';
  collectButton.style.font = '13px/1.2 system-ui, sans-serif';
  collectButton.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.2)';
  collectButton.style.cursor = 'pointer';
  collectButton.addEventListener('click', () => {
    void collectCurrentSelection();
  });

  document.documentElement.appendChild(collectButton);
  return collectButton;
}

function syncCollectButton() {
  const selection = buildSelectionPayload();
  const rect = getSelectionRect();

  if (!selection.ok || !rect) {
    removeCollectButton();
    return;
  }

  const button = ensureCollectButton();
  button.style.top = `${Math.max(rect.bottom + 8, 8)}px`;
  button.style.left = `${Math.max(rect.left, 8)}px`;
}

async function collectCurrentSelection() {
  const selection = buildSelectionPayload();

  if (!selection.ok) {
    showToast(selection.error, false);
    return;
  }

  try {
    await postCollect(selection.payload);
    removeCollectButton();
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

export function initContentScript() {
  if (cleanupContentScript) {
    return cleanupContentScript;
  }

  const handleSelectionChange = () => {
    syncCollectButton();
  };

  const handleMouseUp = () => {
    syncCollectButton();
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
    document.removeEventListener('selectionchange', handleSelectionChange);
    document.removeEventListener('mouseup', handleMouseUp);
    chrome.runtime.onMessage.removeListener?.(handleRuntimeMessage);
    removeCollectButton();
    removeToast();
    cleanupContentScript = null;
  };

  return cleanupContentScript;
}

initContentScript();
