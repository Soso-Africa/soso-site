#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
# Rebuild from the combined specification, not independently merged generated
# files. Fail before schema changes if either consumer or checkout is broken.
pnpm run validate:checkout
node lib/db/scripts/ensure-shopper-schema.mjs
pnpm --filter @workspace/db run push
