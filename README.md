# Nexa CLI App

A full-stack application for managing Nexa CLI commands with a modern UI.

## Features
- User authentication (JWT)
- Command execution and history
- Admin dashboard
- Rate limiting
- Light/Dark mode
- Responsive design

## Setup

### Backend
1. Install dependencies: `npm install`
2. Set up PostgreSQL and update `.env`
3. Run: `npm start`

### Frontend
1. Install dependencies: `npm install`
2. Run: `npm run dev`

### Docker (full stack)
1. Optionally export environment values (`JWT_SECRET`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) to override the defaults baked into `docker-compose.yml`.
2. Build and start everything: `docker compose up --build`.
3. Visit the UI at `http://localhost`, the API at `http://localhost:3001`, and PostgreSQL on `localhost:5432` (volume `db_data` stores database files).

## Enterprise Deployment

- Architecture: 3 containers (PostgreSQL, Backend API, Frontend w/ Nginx). Frontend proxies `/api` to backend.
- Health checks: All services include health endpoints; `GET /api/health` and `GET /api/diagnostics` report status.
- Secrets: Backend supports `JWT_SECRET_FILE` for Docker secrets. If set, it will read the secret from the file path.
- Nexa sidecar (production): The `nexa` service builds a production sidecar that runs `nexa serve`.
  - It downloads the Nexa CLI from GitHub Releases (linux x86_64). On arm64 hosts, Compose runs this service under `linux/amd64` via qemu.
  - Override the CLI asset with `--build-arg NEXA_INSTALL_URL=...` if needed.
  - Data persists in the `nexa_data` volume, mounted at `/var/lib/nexa` (used as `$HOME`).
  - Backend talks HTTP to the sidecar. If your real sidecar uses a different path, set `NEXA_HTTP_INFER_PATH` accordingly.
  - If you prefer CLI mode in the backend, set `NEXA_MODE=cli` and provide `NEXA_CLI_PATH`.

### Windows (Snapdragon X Elite NPU) setup

For best performance on Snapdragon X Elite with the NPU, run Nexa on the Windows host and point the backend to it:

1) Install Windows arm64 Nexa CLI and Qualcomm/QNN runtime as per Nexa docs.
2) Apply your license:
   - `nexa config set license key/<...>`
   - `nexa config list` (verify)
3) Pre-pull models on host (optional):
   - `nexa pull "NexaAI/OmniNeural-4B"`
4) Start the service on host:
   - `nexa serve --host 127.0.0.1:18181`
5) Backend is already configured to use host sidecar:
   - `NEXA_HTTP_URL=http://host.docker.internal:18181` (see `.env`)
6) Bring up the stack (db/backend/frontend):
   - `docker compose up -d db backend frontend`

Notes:
- This avoids container → NPU limitations on Windows; Nexa uses QNN directly on the host.
- If you want to run a Linux sidecar inside Docker instead, start the `nexa` service with the `nexa` profile: `docker compose --profile nexa up -d nexa` and set `NEXA_HTTP_URL=http://nexa:18181`.
  - Optional pre-pull: set `PREPULL_MODELS` (comma-separated) to pre-pull models at sidecar start, e.g. `PREPULL_MODELS=NexaAI/phi4-mini-npu-turbo`.

### Nexa license as a Docker secret (recommended)

1) Create the secret file locally (not committed):

- Copy `secrets/nexa_license.example` to `secrets/nexa_license` and paste your real key there (single line starting with `key/`).

2) Compose already mounts the secret and points the sidecar to it:

- `nexa` service declares `secrets: [nexa_license]` and sets `NEXA_LICENSE_FILE=/run/secrets/nexa_license`.
- Top-level `secrets:` maps `nexa_license` to `./secrets/nexa_license`.

3) Rebuild/start only the sidecar if you just added the secret:

- `docker compose up -d nexa`
- Check: `docker compose logs -f nexa` → look for `[LICENSE]` messages.

### Backend env

- `NEXA_ENABLED=true|false` – enable/disable Nexa integration.
- `NEXA_MODE=http|cli` – http uses sidecar at `NEXA_HTTP_URL`; cli executes local `nexa` binary.
- `NEXA_HTTP_URL` – base URL to Nexa sidecar (default `http://nexa:18181`).
- `NEXA_HTTP_INFER_PATH` – infer endpoint path (default `/infer`).
- `NEXA_HTTP_TIMEOUT_MS` – HTTP timeout in ms (default 30000).
- `NEXA_CLI_PATH` – path/name of Nexa CLI binary when using CLI mode (default `nexa`).
- `JWT_SECRET` or `JWT_SECRET_FILE` – JWT signing secret value, or path to a Docker secret file.
- `NEXA_ALLOWED_MODELS` – comma‑separated list for UI/API model allow‑list, e.g. `NexaAI/OmniNeural-4B,NexaAI/phi4-mini-npu-turbo`.

### Nexa sidecar build args

- `NEXA_INSTALL_URL` – GitHub release asset URL for Linux CLI installer (default pinned in compose).

### Nexa sidecar runtime env

- `PREPULL_MODELS` – comma-separated list of models to `nexa pull` on startup (optional).
- `NEXA_INFER_EXTRA` – extra flags appended to `nexa infer` (e.g., set `'--ngl 0'` to force CPU-only on hosts without GPU/NPU).
- `NEXA_LICENSE` – license key value (string). For production, prefer file/secret.
- `NEXA_LICENSE_FILE` – path to a file containing the license (e.g., `/run/secrets/nexa_license`).

You can also supply the license as a Docker secret:

- Create `secrets/nexa_license` with your key (do not commit it). The compose file already wires this secret to the `nexa` service.
- The sidecar reads it automatically via `NEXA_LICENSE_FILE=/run/secrets/nexa_license`.

Example:

- docker compose build --build-arg NEXA_INSTALL_URL=https://github.com/NexaAI/nexa-sdk/releases/download/v0.2.38-rc3/nexa-cli_linux_x86_64.sh nexa

### Alternative: Single Container (all-in-one)
Use `Dockerfile` for a single container with Postgres, backend, and frontend. Run with `docker build -f Dockerfile .` and `docker run -p 3001:3001 -p 5432:5432`.
