#!/bin/sh
set -eu

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared non trovato." >&2
  echo "Installazione ufficiale macOS: brew install cloudflared" >&2
  echo "Poi rilancia: npm run android:install" >&2
  exit 1
fi

exec cloudflared tunnel --url http://127.0.0.1:4173
