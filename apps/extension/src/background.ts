const COLLECT_COMMAND = 'collect-selection';
const COLLECT_MESSAGE = { type: 'cloud-anki:collect-selection' } as const;

let cleanupBackgroundHandlers: (() => void) | null = null;

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return typeof tab?.id === 'number' ? tab.id : null;
}

async function handleCollectSelection() {
  const tabId = await getActiveTabId();
  if (tabId === null) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, COLLECT_MESSAGE);
  } catch {
    // Ignore pages where the content script is unavailable.
  }
}

export function registerBackgroundHandlers() {
  if (cleanupBackgroundHandlers) {
    return cleanupBackgroundHandlers;
  }

  const handleCommand = (command: string) => {
    if (command !== COLLECT_COMMAND) {
      return;
    }

    void handleCollectSelection();
  };

  chrome.commands.onCommand.addListener(handleCommand);

  cleanupBackgroundHandlers = () => {
    chrome.commands.onCommand.removeListener?.(handleCommand);
    cleanupBackgroundHandlers = null;
  };

  return cleanupBackgroundHandlers;
}

registerBackgroundHandlers();
