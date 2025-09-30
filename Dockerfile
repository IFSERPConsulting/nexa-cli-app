# ---------- build frontend ----------
FROM node:18-bookworm AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ---------- build backend ----------
FROM node:18-bookworm AS backend-build
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ .
COPY --from=frontend-build /frontend/dist ./public

# ---------- runtime image ----------
FROM node:18-bookworm

ENV PG_MAJOR=18 \
    PGDATA=/var/lib/postgresql/data \
    NODE_ENV=production \
    PORT=3001

# install PostgreSQL 18 and Supervisor
RUN apt-get update \
 && apt-get install -y wget gnupg2 ca-certificates lsb-release supervisor \
 && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
 && wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
 && apt-get update \
 && apt-get install -y postgresql-$PG_MAJOR postgresql-client-$PG_MAJOR \
 && rm -rf /var/lib/apt/lists/*

COPY --from=backend-build /app /app
WORKDIR /app

# create service user and init database cluster
RUN groupadd --system nexa && useradd --system --create-home --gid nexa nexa \
 && mkdir -p "$PGDATA" && chown -R nexa:nexa "$PGDATA" /app
USER nexa
RUN /usr/lib/postgresql/$PG_MAJOR/bin/initdb -D "$PGDATA"

# supervisor keeps Postgres + backend alive
COPY <<'EOF' /home/nexa/supervisord.conf
[supervisord]
nodaemon=true

[program:postgres]
command=/usr/lib/postgresql/%(ENV_PG_MAJOR)s/bin/postgres -D %(ENV_PGDATA)s
stdout_logfile=/dev/fd/1
stderr_logfile=/dev/fd/2

[program:backend]
command=node index.js
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/fd/1
stderr_logfile=/dev/fd/2
EOF

EXPOSE 3001 5432
CMD ["/usr/bin/supervisord", "-c", "/home/nexa/supervisord.conf"]
