#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ necessario: https://nodejs.org"
  exit 1
fi
node launch.mjs
