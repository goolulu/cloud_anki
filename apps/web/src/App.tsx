import { useEffect, useMemo, useState } from 'react';
import type { NormalizedCard } from '@cloud-anki/shared';

type Collect = {
  id: string;
  cardId: string;
  word: string;
  lang: string;
  sourceUrl: string;
  context: string;
  pageTitle: string;
  hostname: string;
  capturedAt: string | null;
  createdAt: string;
};

type CollectsResponse = {
  collects?: Collect[];
};

type CardResponse = {
  card?: NormalizedCard;
};

const fallbackApiBaseUrl = 'http://localhost:8787';
const defaultApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? fallbackApiBaseUrl);

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  const base = trimmed || fallbackApiBaseUrl;
  return base.replace(/\/$/, '');
}

export default function App() {
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(defaultApiBaseUrl);
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [collects, setCollects] = useState<Collect[]>([]);
  const [selectedCard, setSelectedCard] = useState<NormalizedCard | null>(null);
  const [selectedCollectId, setSelectedCollectId] = useState<string | null>(null);
  const [isLoadingCollects, setIsLoadingCollects] = useState(true);
  const [isLoadingCard, setIsLoadingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCollects() {
      try {
        setIsLoadingCollects(true);
        setError(null);
        setSelectedCard(null);
        setSelectedCollectId(null);

        const response = await fetch(`${apiBaseUrl}/v1/collects`);
        if (!response.ok) throw new Error(`Failed to load collects (${response.status})`);

        const data = (await response.json()) as CollectsResponse;
        if (cancelled) return;

        setCollects(data.collects ?? []);
      } catch (err) {
        if (cancelled) return;
        setCollects([]);
        setError(err instanceof Error ? err.message : 'Failed to load collects');
      } finally {
        if (!cancelled) {
          setIsLoadingCollects(false);
        }
      }
    }

    void loadCollects();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  async function selectCollect(collect: Collect) {
    try {
      setSelectedCollectId(collect.id);
      setIsLoadingCard(true);
      setError(null);

      const response = await fetch(`${apiBaseUrl}/v1/cards/${collect.cardId}`);
      if (!response.ok) throw new Error(`Failed to load card (${response.status})`);

      const data = (await response.json()) as CardResponse;
      setSelectedCard(data.card ?? null);
    } catch (err) {
      setSelectedCard(null);
      setError(err instanceof Error ? err.message : 'Failed to load card');
    } finally {
      setIsLoadingCard(false);
    }
  }

  const selectedCollect = useMemo(
    () => collects.find((collect) => collect.id === selectedCollectId) ?? null,
    [collects, selectedCollectId],
  );

  const cardSummary = useMemo(() => {
    if (!selectedCard) return '';

    const firstSense = selectedCard.senses[0];
    return [firstSense?.gloss, firstSense?.cn].filter(Boolean).join(' / ');
  }, [selectedCard]);

  const example = selectedCard?.senses[0]?.examples[0] ?? selectedCard?.source?.context ?? selectedCollect?.context ?? '';
  const context = selectedCollect?.context || selectedCard?.source?.context || '';
  const showContext = Boolean(context) && context !== example;

  function applyApiUrl() {
    setApiBaseUrl(normalizeApiBaseUrl(apiBaseUrlInput));
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cloud Anki</p>
          <h1>MVP review console</h1>
          <p className="muted">Browse collects, inspect card details, and download the latest export.</p>
        </div>

        <div className="header-actions">
          <form
            className="api-form"
            onSubmit={(event) => {
              event.preventDefault();
              applyApiUrl();
            }}
          >
            <label className="api-field">
              <span>API base URL</span>
              <input
                value={apiBaseUrlInput}
                onChange={(event) => setApiBaseUrlInput(event.target.value)}
                placeholder="http://localhost:8787"
              />
            </label>
            <button type="submit" className="primary-button">
              Apply API URL
            </button>
          </form>

          <nav className="export-links" aria-label="Export downloads">
            <a href={`${apiBaseUrl}/v1/exports/latest/download?format=tsv`} target="_blank" rel="noreferrer">
              Download TSV
            </a>
            <a href={`${apiBaseUrl}/v1/exports/latest/download?format=csv`} target="_blank" rel="noreferrer">
              Download CSV
            </a>
          </nav>
        </div>
      </header>

      {error ? <p className="status error">{error}</p> : null}

      <section className="layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Collects</h2>
            <span>{collects.length}</span>
          </div>

          {isLoadingCollects ? <p className="status">Loading collects…</p> : null}
          {!isLoadingCollects && collects.length === 0 ? <p className="status">No collects yet.</p> : null}

          <div className="collect-list" aria-label="collects">
            {collects.map((collect) => (
              <button
                key={collect.id}
                type="button"
                className={selectedCollectId === collect.id ? 'collect-item selected' : 'collect-item'}
                onClick={() => void selectCollect(collect)}
              >
                <span className="collect-word">{collect.word}</span>
                <span className="collect-meta">{collect.lang.toUpperCase()} · {collect.hostname || 'unknown host'}</span>
                <span className="collect-meta">{collect.createdAt}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel" aria-label="card details">
          <div className="panel-header">
            <h2>Card</h2>
            {selectedCollect ? <span>{selectedCollect.cardId}</span> : null}
          </div>

          {!selectedCollect ? <p className="status">Select a collect.</p> : null}
          {isLoadingCard ? <p className="status">Loading card…</p> : null}

          {selectedCard ? (
            <div className="detail-grid">
              <section>
                <h3>{selectedCard.word}</h3>
                {selectedCard.phonetic ? <p>{selectedCard.phonetic}</p> : null}
                {cardSummary ? <p>{cardSummary}</p> : null}
                {example ? <p>{example}</p> : null}
              </section>

              <section>
                <dl>
                  <dt>Source</dt>
                  <dd>
                    {selectedCollect ? (
                      <a href={selectedCollect.sourceUrl} target="_blank" rel="noreferrer">
                        {selectedCollect.sourceUrl}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                  <dt>POS</dt>
                  <dd>{selectedCard.pos.length > 0 ? selectedCard.pos.join(', ') : '—'}</dd>
                  <dt>Page</dt>
                  <dd>{selectedCollect?.pageTitle || '—'}</dd>
                  {showContext ? (
                    <>
                      <dt>Context</dt>
                      <dd>{context}</dd>
                    </>
                  ) : null}
                </dl>
              </section>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
