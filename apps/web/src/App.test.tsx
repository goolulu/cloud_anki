import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import App from './App';

const fetchMock = vi.fn();

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('loads collects and shows selected card details', async () => {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);

    if (url === 'http://localhost:8787/v1/collects') {
      return new Response(
        JSON.stringify({
          collects: [
            {
              id: 'collect-1',
              cardId: 'card-1',
              word: 'serendipity',
              lang: 'en',
              sourceUrl: 'https://example.com/article',
              context: 'A happy accidental discovery.',
              pageTitle: 'Example Article',
              hostname: 'example.com',
              capturedAt: null,
              createdAt: '2026-03-20T14:37:44.270Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url === 'http://localhost:8787/v1/cards/card-1') {
      return new Response(
        JSON.stringify({
          card: {
            id: 'card-1',
            word: 'serendipity',
            phonetic: '/ˌserənˈdipədē/',
            pos: ['noun'],
            senses: [
              {
                gloss: 'happy accident',
                cn: '意外发现',
                examples: ['A happy accidental discovery.'],
              },
            ],
            source: {
              url: 'https://example.com/article',
              context: 'A happy accidental discovery.',
            },
            template: 'basic_bilingual',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  render(<App />);

  await userEvent.click(await screen.findByRole('button', { name: /serendipity/i }));

  expect(await screen.findByText('happy accident / 意外发现')).toBeInTheDocument();
  expect(screen.getByText('/ˌserənˈdipədē/')).toBeInTheDocument();
  expect(screen.getAllByText('A happy accidental discovery.').length).toBeGreaterThan(0);
});

test('exposes default export download links', async () => {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);

    if (url === 'http://localhost:8787/v1/collects') {
      return new Response(JSON.stringify({ collects: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  render(<App />);

  expect(await screen.findByRole('link', { name: /download tsv/i })).toHaveAttribute(
    'href',
    'http://localhost:8787/v1/exports/latest/download?format=tsv',
  );
  expect(screen.getByRole('link', { name: /download csv/i })).toHaveAttribute(
    'href',
    'http://localhost:8787/v1/exports/latest/download?format=csv',
  );
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/v1/collects');
});
