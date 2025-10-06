# Nexa CLI App
#
# A production-ready control plane for managing [Nexa](https://www.nexa.ai/) workloads from a secure web interface. The application wraps the official [Nexa SDK](https://github.com/NexaAI/nexa-sdk) so teams can authenticate, launch inference jobs, review results, and supervise model availability from any device.

## What This Project Delivers
- **Unified Nexa operations dashboard** – execute prompts against licensed Nexa models, inspect responses, and review command history in one place.
- **Secure multi-user access** – JWT authentication, per-user defaults, role-based admin tools, and rate limiting to protect expensive hardware.
- **Observability & diagnostics** – real-time health, license status, and database telemetry to keep the Nexa sidecar or on-host service in check.
- **Deployment flexibility** – run the stack with Docker, in a single container, or connect the backend directly to a host-side Nexa service (ideal for Windows Snapdragon X Elite / NPU setups).

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Feature Highlights](#feature-highlights)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
   - [Local Development](#local-development)
   - [Full Stack with Docker Compose](#full-stack-with-docker-compose)
   - [Single Container Image](#single-container-image)
5. [Configuration Reference](#configuration-reference)
6. [Working with Nexa Models](#working-with-nexa-models)
7. [Example: Integrating with IFS Cloud](#example-integrating-with-ifs-cloud)
8. [Troubleshooting](#troubleshooting)
9. [Contributing](#contributing)
10. [About IFS-ERP Consulting](#about-ifs-erp-consulting)

---

## Architecture Overview
```
┌───────────────┐        ┌────────────────┐        ┌────────────────────┐
│  Frontend UI  │ <────> │ Backend API    │ <────> │ Nexa Service / CLI │
│ (React + Vite)│        │ (Express + PG) │        │ (HTTP or CLI mode) │
└──────┬────────┘        └──────┬─────────┘        └────────┬───────────┘
       │                         │                           │
       ▼                         ▼                           ▼
  Authentication            PostgreSQL                 Local Nexa cache
  Command console     Command history & stats       Model binaries & license
```
- **Frontend**: React UI hosted behind Nginx (or `npm run dev` during development) with dark/light themes and command dashboards.
- **Backend**: Node.js/Express server with JWT auth, rate limiting, role-based admin APIs, and live Nexa diagnostics.
- **Database**: PostgreSQL storing users, command history, stats, and admin metadata. Provided via Docker volume (`db_data`).
- **Nexa runtime**: Either connect to a host-side Nexa service (`nexa serve`) or use the optional `nexa` docker profile to run an embedded Nexa sidecar.

---

## Feature Highlights
- 🔐 **Authentication & RBAC** – register/login flows, JWT issuance, admin-only dashboards, configurable default models per user.
- 🧠 **Command execution** – send chat-style prompts to Nexa models, capture outputs, download history, and audit failures.
- 📊 **Insights** – `/api/stats` powers the Stats Dashboard with total commands, average prompt length, and active usage windows.
- ⚙️ **Dynamic model discovery** – backend automatically merges whitelisted models with whatever the Nexa CLI has cached locally. Hitting `/api/models?refresh=1` surfaces freshly pulled models such as `NexaAI/Granite-4-Micro-NPU`.
- 🛡️ **Enterprise hardening** – Docker secrets for licenses, health checks, structured logging, configurable timeouts, and a request rate limiter.

---

## Prerequisites
- **Nexa license & CLI**: install the Nexa SDK on the host (ARM64 or x86) and confirm `nexa list` works.
- **Docker**: Docker Desktop 4.29+ with Compose v2 (or native Docker Engine + Compose plugin).
- **Node.js**: v18+ if you want to run backend/frontend locally without containers.
- **PostgreSQL**: optional if you are not using Compose (otherwise the stack boots its own database).

---

## Quick Start

### Local Development
```
# Backend
cd backend
npm install
npm start

# Frontend
cd ../frontend
npm install
npm run dev
```
Set `NEXA_HTTP_URL` (or `NEXA_MODE=cli` + `NEXA_CLI_PATH`) in `.env` so the backend can talk to your Nexa runtime.

### Full Stack with Docker Compose
```
docker compose up --build
```
- UI: <http://localhost>
- API: <http://localhost:3001>
- PostgreSQL: `localhost:5432` (credentials in `.env` / `docker-compose.yml`).

The backend container mounts the host’s Nexa cache (`%USERPROFILE%\.cache\nexa.ai\nexa_sdk\models` on Windows) so model discovery reflects what you have already pulled.

### Single Container Image
```
docker build -f Dockerfile . -t nexa-cli-app:latest
docker run --rm -p 3001:3001 -p 5432:5432 nexa-cli-app:latest
```
This all-in-one image brings up Postgres, backend, and frontend inside a single container—ideal for demos or edge deployments.

---

## Configuration Reference
| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXA_ENABLED` | Toggle Nexa integration | `true` |
| `NEXA_MODE` | `http` (sidecar/host) or `cli` (local binary) | `http` |
| `NEXA_HTTP_URL` | Base URL to Nexa service | `http://host.docker.internal:18181` |
| `NEXA_HTTP_INFER_PATH` | REST endpoint path | `/v1/chat/completions` |
| `NEXA_HTTP_TIMEOUT_MS` | Request timeout | `30000` |
| `NEXA_ALLOWED_MODELS` | Comma-separated allow list | `NexaAI/OmniNeural-4B,NexaAI/phi4-mini-npu-turbo` |
| `NEXA_MODEL_CACHE_MS` | Cache TTL for discovered models | `30000` |
| `JWT_SECRET` | Signing key for tokens | `supersecret` (change this!) |
| `DB_*` | PostgreSQL credentials | see `.env` |
| `PREPULL_MODELS` | Optional list for sidecar bootstrap | `NexaAI/OmniNeural-4B` |
| `NEXA_LICENSE_FILE` | Path to Docker secret with license | `/run/secrets/nexa_license` |

For a full list of environment variables, inspect `.env`, `docker-compose.yml`, and the comments in `Dockerfile.backend` / `Dockerfile.nexa`.

---

## Working with Nexa Models
1. **Pull models on the host**:
   ```
   nexa pull "NexaAI/Granite-4-Micro-NPU"
   ```
2. **Refresh the UI**:
   ```
   curl http://localhost/api/models?refresh=1
   ```
   The backend merges the allow-list (`NEXA_ALLOWED_MODELS`) with whatever the Nexa CLI reports via `nexa list`.
3. **Set user defaults**: after login, use the "Set as Default" button to bind a model to your account.
4. **Send prompts**: the command console issues `/api/run-nexa` requests; all outputs and failures are saved for audit.

> **Tip:** When running in HTTP mode, keep `nexa serve` active on the host (`nexa serve --host 127.0.0.1:18181`). Compose already points the backend to `http://host.docker.internal:18181`.

---

## Troubleshooting
- **`SDKError(Model loading failed)`**: ensure the host-side Nexa service has pulled the requested model and has access to the proper NPU/GPU runtime (QNN/QT libraries on Snapdragon X Elite).
- **Model not listed in UI**: confirm `nexa list` shows the model on the host, then hit `/api/models?refresh=1`. Also check that the Compose volume mounting the cache is intact.
- **Auth issues**: delete the user from `users` table or reset JWT secret; tokens expire after 1 hour by default.
- **Database migrations**: if tables are missing, rerun `init.sql` (Compose automatically loads it via `docker-entrypoint-initdb.d`).

---

## Contributing
1. Fork the repo & clone it locally.
2. Create a feature branch (`git checkout -b feat/my-update`).
3. Run linting/tests where applicable.
4. Open a PR describing the change—screenshots welcome!

Bug reports and feature ideas are also welcome via GitHub Issues.

---

## Example: Possible ways of integrate with IFS Cloud
Bring Nexa-powered generative assistance directly into your IFS Cloud processes:
1. **Expose the API** – deploy this app in your preferred environment (Azure Container Apps, AWS ECS, on-prem) and secure it behind your gateway/IdP.
2. **Create an IFS business event** – configure IFS Cloud to emit events (e.g., service request created). Forward the payload to the Nexa CLI App’s `/api/run-nexa` endpoint using an integration flow (IFS Connect, Azure Logic Apps, or MuleSoft).
3. **Craft domain prompts** – build prompt templates that summarize IFS data (asset history, work orders) and request recommendations or draft responses from Nexa models.
4. **Store enriched insights** – write the Nexa output back to IFS via a REST/ODATA call, populate custom fields, or trigger further workflow automations.
5. **Monitor in the dashboard** – operators track command volume, response quality, and available models from the built-in admin panel.

Result: field engineers or service coordinators receive AI-generated recommendations inside the IFS Cloud UI without leaving their workflow, backed by your governed Nexa deployment.
---

## About IFS-ERP Consulting
[Nexa CLI App](https://github.com/your-org/nexa-cli-app) is brought to you by [IFS-ERP Consulting](https://www.ifs-erp.consulting/), specialists in bridging enterprise ERP platforms with AI-driven automation.

**Need help operationalizing Nexa with IFS Cloud?**
- Architecture & security assessments
- Custom connector and workflow development
- Prompt engineering with industry-specific models
- Managed hosting, monitoring, and support SLAs

👉 **Book a discovery call today:** <https://www.ifs-erp.consulting/contact>

Let our consultants tailor this Nexa integration for your IFS Cloud instance, unlock predictive service insights, and accelerate your AI adoption roadmap.
