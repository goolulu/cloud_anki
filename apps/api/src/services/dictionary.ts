import { nanoid } from 'nanoid';

import type { NormalizedCard } from '@cloud-anki/shared';

export interface DictionaryProvider {
  analyze(input: { word: string; context?: string; sourceUrl: string; lang: string }): Promise<NormalizedCard>;
}

export class MockDictionaryProvider implements DictionaryProvider {
  async analyze(input: {
    word: string;
    context?: string;
    sourceUrl: string;
    lang: string;
  }): Promise<NormalizedCard> {
    const { word, context = '', sourceUrl, lang } = input;

    return {
      id: nanoid(),
      word,
      phonetic: '',
      pos: [],
      senses: context
        ? [
            {
              gloss: '',
              cn: '',
              examples: [context],
            },
          ]
        : [],
      roots: {
        root: '',
        affixes: [],
        analysis: '',
      },
      synonyms: [],
      collocations: [],
      audio: {
        url: `https://example.com/audio/${encodeURIComponent(word)}.mp3`,
        format: 'mp3',
      },
      source: {
        url: sourceUrl,
        context,
      },
      template: 'basic_bilingual',
      createdAt: new Date().toISOString(),
      // lang is stored alongside card in DB tables; schema doesn't include it to keep it minimal.
    } satisfies NormalizedCard;
  }
}
