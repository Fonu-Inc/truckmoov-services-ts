#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/truckmoov-services-ts}"
RELEASE_DIR="${RELEASE_DIR:?RELEASE_DIR is required}"
CURRENT_LINK="${APP_DIR}/current"
SHARED_DIR="${APP_DIR}/shared"
RUN_DIR="${APP_DIR}/run"
LOG_DIR="${APP_DIR}/log"
ENV_FILE="${SHARED_DIR}/.env"
LEGACY_ENV_FILE="${APP_DIR}/.env"
PID_FILE="${RUN_DIR}/auth-service.pid"
LOG_FILE="${LOG_DIR}/auth-service.log"

mkdir -p "$SHARED_DIR" "$RUN_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" && -f "$LEGACY_ENV_FILE" ]]; then
  cp "$LEGACY_ENV_FILE" "$ENV_FILE"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it on the server before deploying."
  exit 1
fi

for cmd in node curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@9.15.0 --activate
  else
    echo "pnpm is not installed and corepack is unavailable"
    exit 1
  fi
fi

cd "$RELEASE_DIR"
pnpm install --frozen-lockfile
pnpm build:auth

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

set -a
. "$ENV_FILE"
set +a

AUTH_PORT="${AUTH_PORT:-3001}"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID"
    for _ in $(seq 1 30); do
      if ! kill -0 "$OLD_PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done

    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID"
    fi
  fi
fi

cd "$CURRENT_LINK"
nohup env NODE_ENV=production node dist/apps/auth/src/main.js >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${AUTH_PORT}/auth/health" >/dev/null; then
    echo "auth-service is healthy on port ${AUTH_PORT}"
    exit 0
  fi

  if ! kill -0 "$NEW_PID" 2>/dev/null; then
    echo "auth-service exited during startup"
    tail -n 200 "$LOG_FILE" || true
    exit 1
  fi

  sleep 2
done

echo "auth-service did not become healthy in time"
tail -n 200 "$LOG_FILE" || true
exit 1
