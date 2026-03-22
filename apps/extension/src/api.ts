import type { CollectRequest } from '@cloud-anki/shared';

type CollectResponse = {
  collectId: string;
  cardId: string;
};

const API_BASE_URL = 'http://localhost:8787';

function isCollectResponse(value: unknown): value is CollectResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as Record<string, unknown>;
  return typeof response.collectId === 'string' && typeof response.cardId === 'string';
}

export async function postCollect(payload: CollectRequest): Promise<CollectResponse> {
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
