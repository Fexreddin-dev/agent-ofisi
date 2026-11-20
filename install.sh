#!/usr/bin/env sh
# Agent Ofisi installer (macOS / Linux)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install the LTS version from https://nodejs.org and run ./install.sh again."
  exit 1
fi
exec node install.js "$@"
