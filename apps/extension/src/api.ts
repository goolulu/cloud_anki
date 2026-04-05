import type { CollectRequest, NormalizedCard } from '@cloud-anki/shared';

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

function isPreviewCard(value: unknown): value is NormalizedCard {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const card = value as Record<string, unknown>;
  return typeof card.word === 'string';
}

function getPreviewCardFromBody(body: unknown): NormalizedCard | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const response = body as Record<string, unknown>;
  const candidate = response.card ?? response.preview;
  return isPreviewCard(candidate) ? candidate : null;
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

export async function postPreview(payload: CollectRequest): Promise<NormalizedCard> {
  const response = await fetch(`${API_BASE_URL}/v1/preview`, {
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
        : `Preview request failed with status ${response.status}`;

    throw new Error(message);
  }

  const card = getPreviewCardFromBody(body);
  if (!card) {
    throw new Error('Preview request returned an invalid response');
  }

  return card;
}
