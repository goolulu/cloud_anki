# cloud-anki

Monorepo for:
- apps/api (Cloud API)
- apps/web (Web UI)
- apps/extension (Browser extension)
- packages/shared (schemas/types)

## Production with Docker Compose

1. Create the environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Set `OPENAI_API_KEY` in `.env` if card generation is required.

3. Build and start the API and Web UI:

   ```powershell
   docker compose up -d --build
   ```

Open <http://localhost:3000>. The API is also available at
<http://localhost:8787>; the Web UI accesses it through the same-origin `/api`
proxy. Database migrations run automatically when the API container starts,
and SQLite data is kept in the `cloud-anki-data` volume.

Useful commands:

```powershell
docker compose ps
docker compose logs -f
docker compose down
```

To remove the persisted SQLite database as well, run `docker compose down -v`.
