import { z } from 'zod';

import { CollectRequestSchema } from '@cloud-anki/shared';

export const CollectResponseSchema = z.object({
  collectId: z.string(),
  cardId: z.string(),
});
export type CollectResponse = z.infer<typeof CollectResponseSchema>;

export const GetCardResponseSchema = z.object({
  card: z.any(),
});
export type GetCardResponse = z.infer<typeof GetCardResponseSchema>;
