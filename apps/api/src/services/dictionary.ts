import { nanoid } from 'nanoid';
import OpenAI from 'openai';

import { NormalizedCardSchema } from '@cloud-anki/shared';
import type { NormalizedCard } from '@cloud-anki/shared';

export interface DictionaryProvider {
  analyze(input: { word: string; context?: string; sourceUrl: string; lang: string }): Promise<NormalizedCard>;
}

export type OpenAIProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_TIMEOUT_MS = 20_000;

function normalizeBaseUrl(value: string | undefined) {
  return (value?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}

function buildFallbackCard(input: {
  word: string;
  context?: string;
  sourceUrl: string;
  lang: string;
}): NormalizedCard {
  const { word, context = '', sourceUrl } = input;

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
      url: 'https://example.com/audio.mp3',
      format: 'mp3',
    },
    source: {
      url: sourceUrl,
      context,
    },
    template: 'basic_bilingual',
    createdAt: new Date().toISOString(),
  } satisfies NormalizedCard;
}

function normalizeGeneratedCard(value: unknown, input: {
  word: string;
  context?: string;
  sourceUrl: string;
  lang: string;
}) {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const fallback = buildFallbackCard(input);

  const candidate: NormalizedCard = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallback.id,
    word: toOptionalString(raw.word) || input.word,
    phonetic: toOptionalString(raw.phonetic),
    pos: toStringArray(raw.pos),
    senses: Array.isArray(raw.senses)
      ? raw.senses
          .map((sense) => {
            const entry = sense && typeof sense === 'object' ? (sense as Record<string, unknown>) : {};
            return {
              gloss: toOptionalString(entry.gloss),
              cn: toOptionalString(entry.cn),
              examples: toStringArray(entry.examples).slice(0, 3),
            };
          })
          .filter((sense) => sense.gloss || sense.cn || sense.examples.length > 0)
      : fallback.senses,
    roots:
      raw.roots && typeof raw.roots === 'object'
        ? {
            root: toOptionalString((raw.roots as Record<string, unknown>).root),
            affixes: toStringArray((raw.roots as Record<string, unknown>).affixes),
            analysis: toOptionalString((raw.roots as Record<string, unknown>).analysis),
          }
        : fallback.roots,
    synonyms: toStringArray(raw.synonyms).slice(0, 8),
    collocations: toStringArray(raw.collocations).slice(0, 8),
    source: {
      url: input.sourceUrl,
      context: input.context ?? '',
    },
    template: 'basic_bilingual',
    createdAt: new Date().toISOString(),
  };

  const parsed = NormalizedCardSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`invalid_card_shape:${parsed.error.message}`);
  }

  return parsed.data;
}

export class MockDictionaryProvider implements DictionaryProvider {
  async analyze(input: {
    word: string;
    context?: string;
    sourceUrl: string;
    lang: string;
  }): Promise<NormalizedCard> {
    return buildFallbackCard(input);
  }
}

export class OpenAIDictionaryProvider implements DictionaryProvider {
  private readonly client: OpenAI;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAIProviderConfig) {
    if (!config.apiKey?.trim()) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.apiKey = config.apiKey.trim();
    this.model = config.model?.trim() || DEFAULT_OPENAI_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: normalizeBaseUrl(config.baseUrl),
    });
  }

  async analyze(input: {
    word: string;
    context?: string;
    sourceUrl: string;
    lang: string;
  }): Promise<NormalizedCard> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          temperature: 0.2,
          stream: true,
          response_format: {
            type: 'json_object',
          },
          messages: [
            {
              role: 'developer',
              content:
                'You create concise bilingual vocabulary cards for language learners. Return JSON only. ' +
                'The JSON must contain: word, phonetic, pos, senses, roots, synonyms, collocations. ' +
                'Each sense should contain gloss, cn, examples. ' +
                'Target cn must be Simplified Chinese. Keep outputs brief and practical. ' +
                'Do not invent source URLs. Omit audio unless you have a real URL.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                word: input.word,
                context: input.context ?? '',
                sourceUrl: input.sourceUrl,
                lang: input.lang,
                outputLanguage: 'zh-CN',
              }),
            },
          ],
        },
        {
          signal: controller.signal,
        },
      );

      let content = '';
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          content += delta;
        }
      }

      content = stripCodeFence(content);
      if (!content) {
        throw new Error('OpenAI returned an empty completion');
      }

      const parsed = JSON.parse(content);
      return normalizeGeneratedCard(parsed, input);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createDictionaryProvider(config: OpenAIProviderConfig): DictionaryProvider {
  if (config.apiKey?.trim()) {
    return new OpenAIDictionaryProvider(config);
  }

  return new MockDictionaryProvider();
}
