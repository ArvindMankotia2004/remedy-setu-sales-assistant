#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org and run this again."
  exit 1
fi
[ -d node_modules ] || { echo "Installing dependencies (first run only)..."; npm install; }
[ -f .env ] || cp .env.example .env
( sleep 1.5; (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) ) >/dev/null 2>&1 &
node server.js
