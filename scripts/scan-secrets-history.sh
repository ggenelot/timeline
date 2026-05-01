#!/usr/bin/env bash
set -euo pipefail

patterns='(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----)'
allowlist='^(\.env\.example:[0-9]+:SLACK_BOT_TOKEN=xoxb-your-bot-token)$'

raw_hits=$(git rev-list --all | while read -r commit; do
  git grep -nE "$patterns" "$commit" || true
done | sed -E 's/^[0-9a-f]{40}://')

hits=$(printf '%s\n' "$raw_hits" | sort -u)
filtered=$(printf '%s\n' "$hits" | rg -v "$allowlist" || true)

if [[ -n "$filtered" ]]; then
  echo "$filtered"
  printf "\n[scan] Potential secrets found outside allowlist.\n"
  exit 1
fi

if [[ -n "$hits" ]]; then
  echo "$hits"
  printf "\n[scan] Only allowlisted placeholders found in git history.\n"
else
  echo "[scan] No matches found in full git history."
fi
