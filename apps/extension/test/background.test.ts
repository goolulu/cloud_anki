import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('background script', () => {
  let commandListener: ((command: string) => void) | undefined;

  beforeEach(async () => {
    vi.resetModules();

    commandListener = undefined;

    (globalThis as typeof globalThis & { chrome: unknown }).chrome = {
      commands: {
        onCommand: {
          addListener: vi.fn((listener: (command: string) => void) => {
            commandListener = listener;
          }),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 17 }]),
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    };

    const module = await import('../src/background.ts');
    module.registerBackgroundHandlers();
  });

  it('forwards the collect command to the active tab content script', async () => {
    commandListener?.('collect-selection');
    await Promise.resolve();
    await Promise.resolve();

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(17, { type: 'cloud-anki:collect-selection' });
  });
});
