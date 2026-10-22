#!/bin/bash
# Sessões do Claude Code na nuvem: instala o Playwright do tr pra `node scripts/check.mjs` (raiz,
# fin e tr) rodar sempre. Local, não faz nada: cada um instala do jeito do README.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR/tr"
# npm install (não ci): reaproveita o node_modules guardado no cache do container.
npm install --no-audit --no-fund

# O container já traz o Chromium em PLAYWRIGHT_BROWSERS_PATH; só baixa se a versão do
# Playwright pedir um navegador que não está lá.
if ! node -e "process.exit(require('fs').existsSync(require('playwright').chromium.executablePath()) ? 0 : 1)"; then
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD= npx playwright install chromium
fi
