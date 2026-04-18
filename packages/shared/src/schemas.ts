import { z } from 'zod';

/**
 * CollectRequest: Extension -> Cloud
 */
export const CollectRequestSchema = z.object({
  word: z.string().min(1),
  sourceUrl: z.string().url(),
  context: z.string().optional().default(''),
  lang: z.string().min(2).max(10).default('en'),
  capturedAt: z.string().datetime().optional(),
  page: z
    .object({
      title: z.string().optional().default(''),
      hostname: z.string().optional().default(''),
    })
    .optional(),
});
export type CollectRequest = z.infer<typeof CollectRequestSchema>;

/**
 * KnownWordsDelta: Cloud -> Extension
 */
export const KnownWordsDeltaSchema = z.object({
  version: z.number().int().nonnegative(),
  known: z.array(z.string()),
  unknown: z.array(z.string()),
  deleted: z.array(z.string()),
});
export type KnownWordsDelta = z.infer<typeof KnownWordsDeltaSchema>;

/**
 * NormalizedCard v1: Cloud internal + export
 */
export const NormalizedCardSenseSchema = z.object({
  gloss: z.string().optional().default(''),
  cn: z.string().optional().default(''),
  examples: z.array(z.string()).optional().default([]),
});
export type NormalizedCardSense = z.infer<typeof NormalizedCardSenseSchema>;

export const NormalizedCardSchema = z.object({
  id: z.string().optional(),
  word: z.string().min(1),
  phonetic: z.string().optional().default(''),
  pos: z.array(z.string()).optional().default([]),
  senses: z.array(NormalizedCardSenseSchema).optional().default([]),
  roots: z
    .object({
      root: z.string().optional().default(''),
      affixes: z.array(z.string()).optional().default([]),
      analysis: z.string().optional().default(''),
    })
    .optional(),
  synonyms: z.array(z.string()).optional().default([]),
  collocations: z.array(z.string()).optional().default([]),
  audio: z
    .object({
      url: z.string().url(),
      format: z.string().optional().default(''),
    })
    .optional(),
  source: z
    .object({
      url: z.string().url(),
      context: z.string().optional().default(''),
    })
    .optional(),
  template: z.string().optional().default('basic_bilingual'),
  createdAt: z.string().datetime().optional(),
});
export type NormalizedCard = z.infer<typeof NormalizedCardSchema>;

/**
 * Export row contract (CSV/TSV)
 */
export const ExportRowSchema = z.object({
  Front: z.string(),
  Back: z.string(),
  Example: z.string(),
  Phonetic: z.string(),
  Roots: z.string(),
  SourceUrl: z.string(),
  Context: z.string(),
});
export type ExportRow = z.infer<typeof ExportRowSchema>;
