# Findling Live Deployment Checklist

This checklist is for live deployment. The goal is a public app where agents can
discover moments, pay x402 over Circle Gateway on Arc, and leave an auditable
receipt/trace.

## 1. Required Environment

Set these in the deployment provider before building:

```bash
NEXT_PUBLIC_APP_URL="https://<your-live-host>"

DATABASE_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."

AUTH_SESSION_SECRET="<openssl rand -hex 32>"

GATEWAY_FACILITATOR_URL="https://gateway-api-testnet.circle.com"
SELLER_ADDRESS="0x..."
PAYMENT_PROVIDER="gateway_x402"

# Required if the deployment includes on-chain withdrawals.
SELLER_PRIVATE_KEY="0x..."
```

Optional, depending on the deployed workflow:

```bash
# YouTube imports.
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_OAUTH_REDIRECT_URI="https://<your-live-host>/api/creator/youtube/callback"
YOUTUBE_TOKEN_ENC_KEY="<openssl rand -hex 32>"

# Semantic search. `local` is allowed, but confirm your host can download/cache
# the HF model. For lower cold-start risk, use openai or gemini with a key.
EMBEDDING_PROVIDER="openai"
OPENAI_API_KEY="..."
```

## 2. Preflight

Run locally against `.env.local` before pushing:

```bash
pnpm deploy:check
pnpm preflight
```

For a deployment that includes creator/finder withdrawals and YouTube import:

```bash
pnpm deploy:check:full
```

`pnpm build` should not need a live database connection. The homepage market
stats render at request time, not during `next build`.

## 3. Database And Storage

1. Create/confirm the Supabase Postgres project has `pgvector`.
2. Run migrations:

   ```bash
   pnpm db:migrate
   ```

3. Confirm the storage bucket/policies used by `src/server/storage` are present.
4. Seed or upload enough published moments for agent search.
5. Run embeddings for those moments if needed:

   ```bash
   node --env-file=.env.local --import tsx scripts/reembed.ts
   ```

## 4. Circle Gateway / Arc

1. Confirm `SELLER_ADDRESS` is the Gateway seller wallet receiving gross x402
   settlements.
2. If withdrawals are enabled, set `SELLER_PRIVATE_KEY` and confirm it
   derives to `SELLER_ADDRESS`; the app refuses mismatched keys.
3. Fund buyer session keys externally in Circle Gateway. Findling stores only
   the session-key address and spending caps.
4. Smoke the live facilitator support:

   ```bash
   node --env-file=.env.local --import tsx scripts/smoke-arc-live.ts
   ```

## 5. Live Smoke Tests

After deployment, check:

```bash
curl -i https://<your-live-host>/api/healthz
curl https://<your-live-host>/skill.md
```

Then run the main workflow:

1. Sign in as a creator.
2. Publish at least one priced moment.
3. Open `/studio/agents`, issue an agent key, and create a session grant.
4. Use the agent API or MCP to search moments.
5. Pay the returned `unlockUrl` with a funded Gateway session key.
6. Open the generated receipt (`/r/<slug>`) and agent trace (`/trace/<runId>`).
7. If showing payouts, withdraw creator/finder earnings and open the Arc tx.

## 6. Walkthrough Beats

Keep the recording under 3 minutes:

1. **Problem:** short video has monetizable moments, but agents need a machine
   payable licensing surface.
2. **Agent loop:** search by intent, inspect a moment, pay x402 with test USDC,
   receive license/clip URL.
3. **Creator/finder economy:** settlement splits 80/12/8, finder agents earn for
   useful curation.
4. **Trust:** show receipt and agent trace.
5. **Circle/Arc proof:** show the x402/Gateway settlement or payout reference.
