#!/usr/bin/env bash
# Signs fresh access tokens (15 min TTL) for the browser/curl test scripts.
# Usage: ./scripts/sign-tokens.sh
set -euo pipefail
cd "$(dirname "$0")/../apps/api"

cat > sign-token.mts <<'EOF'
process.env.NODE_ENV = 'test';
import { db } from './src/db/index.js';
import { buildApp } from './src/index.js';
const app = await buildApp();
for (const email of process.argv.slice(2)) {
  const u = await db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirstOrThrow();
  console.log(email + ' ' + app.jwt.sign({ id: u.id, email: u.email, role: u.role, type: 'access' as const }));
}
await app.close();
EOF

export PATH="$HOME/.local/share/pnpm/bin:$PATH"
NODE_ENV=test npx tsx sign-token.mts \
  admin@avc.local manager@avc.local driver1@avc.local worker1@avc.local \
  2>/dev/null | grep "@avc.local" > /tmp/opencode/tokens.txt
rm sign-token.mts

echo "tokens written to /tmp/opencode/tokens.txt"
