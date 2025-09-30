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
3. Visit the UI at `http://localhost:5173`, the API at `http://localhost:3001`, and PostgreSQL on `localhost:5432` (volume `db_data` stores database files).

### Alternative: Single Container (all-in-one)
Use `Dockerfile` for a single container with Postgres, backend, and frontend. Run with `docker build -f Dockerfile .` and `docker run -p 3001:3001 -p 5432:5432`.
