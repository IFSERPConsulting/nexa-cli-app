# Support Ticket: Nexa CLI in Docker on Windows (Snapdragon X Elite)

**Subject:** Nexa CLI v0.2.37 inside Docker (Windows Snapdragon X Elite) – "Oops. Model failed to load." with no further diagnostics

## Environment
- Host: Windows 11 on Snapdragon X Elite (32 GB RAM)
- Docker Desktop for Windows (WSL2 backend)
- Container base: debian:bookworm-slim
- Nexa CLI: v0.2.37 (installed via 
exa-cli_linux_x86_64.sh)
- License: Injected via Docker secret and applied with 
exa config set license key/...

## Container Setup
- Installs curl, ca-certificates, ash, xz-utils, 
odejs, sox, fmpeg, downloads Nexa CLI 0.2.37, and runs the installer
- Runs as user 
exa with home /var/lib/nexa
- HTTP sidecar (
ode /srv/server.js) executes 
exa infer
- Shared memory: shm_size: 4g
- License applied at startup (logs show [LICENSE] existing license detected)
- Models downloaded (
exa pull) and cached in /var/lib/nexa/.cache/nexa.ai

## Backend Integration
- Backend (Node/Express) calls Nexa over HTTP (http://nexa:18181 when containerized)
- Also tested http://host.docker.internal:18181 pointing to native host 
exa serve

## Steps to Reproduce
1. docker compose up -d nexa backend
2. Inside container:
   `ash
   docker compose exec nexa nexa config list   # license present
   docker compose exec nexa nexa list          # models cached
   `
3. Run inference:
   `ash
   docker compose exec nexa sh -lc "nexa infer 'NexaAI/phi4-mini-npu-turbo' -p 'hello' --ngl 0 --max-tokens 64 --think=false"
   `
4. Observe CLI output:
   `
   ⚠️ Oops. Model failed to load.

   👉 Try these:
   - Verify your system meets the model's requirements.
   - Seek help in our discord or slack.
   `
   - Exit code = 0, stderr empty, no additional logs even with NEXA_LOG_LEVEL=debug
5. Sidecar HTTP call returns 500 with the same banner in output field and empty stderr

## Diagnostics
- /diag endpoint:
  `json
  {
    "time": "2025-10-02T09:16:02.945Z",
    "version": "NexaSDK Bridge Version: v1.0.17\nNexaSDK CLI Version:    v0.2.37",
    "config": "license: key/...",
    "models": "... OmniNeural-4B ... phi4-mini-npu-turbo ..."
  }
  `
- License cache: /var/lib/nexa/.cache/nexa.ai/nexa_sdk/config contains the key
- No crash logs or detailed errors recorded

## Observed Behavior
- All attempts to load models inside the Debian container fail with the generic banner
- Same models run successfully when 
exa serve --host 127.0.0.1:18181 is executed natively on Windows (host) – backend connects to host service and inference succeeds (NPU used)

## Mitigations Attempted
- CPU fallback flags (--ngl 0, --think=false, low --max-tokens, sampler adjustments)
- Increased shared memory to 4 GiB
- Tested OmniNeural-4B and phi4-mini-npu-turbo
- Verified license (
exa config list) and cache state (
exa list)
- Ran inference with debug logging (NEXA_LOG_LEVEL=debug, --verbose) – still only the banner

## Request to Nexa
1. Does the Nexa CLI require runtime libraries (QNN, GPU drivers, etc.) that aren’t available inside this Debian container on Windows/ARM?
2. Are there environment variables or configuration steps to enable CPU fallback/QNN emulation in containerized environments?
3. Is there a CLI flag to produce more detailed diagnostics beyond the “Oops” banner?
4. If containerized Nexa on Windows isn’t supported, please confirm so we can rely solely on host-side 
exa serve.

We can supply the Dockerfile, docker-compose.yml, or additional logs on request.
