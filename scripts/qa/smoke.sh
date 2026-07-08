#!/usr/bin/env bash
# Visual smoke test for EDodoDraw — loads every example, screenshots it, and
# fails loudly on any console error. Run against a live dev/preview server.
#
#   npm run dev            # in another shell (http://localhost:5273)
#   scripts/qa/smoke.sh
#
# Screenshots land in .screenshots/smoke-*.png. Read them to confirm the
# hand-drawn render is correct (Stage 2 of the two-stage testing rule).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:5273}"
SESSION="${PLAYWRIGHT_CLI_SESSION:-edd-smoke}"
export PLAYWRIGHT_CLI_SESSION="$SESSION"
mkdir -p .screenshots
EXAMPLES=("Welcome" "Flowchart" "Architecture" "Animated Arrows" "Mermaid")
FAIL=0

playwright-cli open "$BASE" >/dev/null 2>&1
sleep 4
playwright-cli resize 1500 920 >/dev/null 2>&1

for ex in "${EXAMPLES[@]}"; do
  slug=$(echo "$ex" | tr ' A-Z' '-a-z')
  playwright-cli click "getByRole('button', { name: '$ex' })" >/dev/null 2>&1
  sleep 2
  playwright-cli screenshot --filename=".screenshots/smoke-$slug.png" >/dev/null 2>&1
  info=$(playwright-cli --raw eval "JSON.stringify({n:document.querySelectorAll('[data-node]').length,e:document.querySelectorAll('[data-edge]').length,diag:document.querySelector('.edd-diag-summary')?.innerText})" 2>/dev/null)
  errs=$(playwright-cli --raw console error 2>/dev/null | grep -c "Error:" || true)
  echo "$ex -> $info (console errors: ${errs:-0})"
  if [ "${errs:-0}" != "0" ]; then FAIL=1; fi
done

playwright-cli close >/dev/null 2>&1 || true
[ "$FAIL" = "0" ] && echo "✓ smoke passed" || { echo "✕ smoke FAILED (console errors)"; exit 1; }
