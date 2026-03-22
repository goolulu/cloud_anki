import { beforeEach, expect, test, vi } from 'vitest';

type CommandListener = (command: string) => void;

const queryMock = vi.fn();
const sendMessageMock = vi.fn();
let commandListener: CommandListener | undefined;
let cleanup: (() => void) | undefined;

beforeEach(async () => {
  vi.resetModules();

  commandListener = undefined;
  queryMock.mockReset();
  sendMessageMock.mockReset();

  (globalThis as any).chrome = {
    commands: {
      onCommand: {
        addListener: vi.fn((listener: CommandListener) => {
          commandListener = listener;
        }),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      query: queryMock,
      sendMessage: sendMessageMock,
    },
  };

  const module = await import('../src/background.ts');
  cleanup = module.registerBackgroundHandlers();
});

test('forwards the collect command to the active tab content script', async () => {
  queryMock.mockResolvedValue([{ id: 7 }]);
  sendMessageMock.mockResolvedValue(undefined);

  commandListener?.('collect-selection');

  await vi.waitFor(() => {
    expect(sendMessageMock).toHaveBeenCalledWith(7, { type: 'cloud-anki:collect-selection' });
  });
});
