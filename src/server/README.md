# Findling server modules

Backend module layout. Each module has one purpose, talks through a typed
interface, and is testable in isolation. Routes validate and orchestrate; they
never touch the DB directly.

```
src/server/
  agent/          MCP tools + REST agent surface, search ranking, agent_runs trace
  auth/           SIWE login, wallet-proven agent keys, HMAC sessions
  catalog/        asset / moment / curation writes; studio + transactions read-models
  clip/           clip worker — ffmpeg trim, poster, watermarked preview (yt-dlp + ffmpeg)
  crypto/         token encryption (e.g. YouTube refresh tokens)
  db/             Drizzle schema + client
  grants/         buyer session grants — funded session-key address + spend caps
  ledger/         earnings derivation, settlement split, on-chain withdrawals
  mcp/            MCP server exposing the agent surface over stdio
  ownership/      attestation capture, channel-control status, provenance
  payment/        x402 / Circle Gateway provider (+ deterministic mock), seller wiring
  receipt/        public receipt read-model (proof of license + 80/12/8 split)
  search/         embedding source text, EmbeddingProvider, pgvector persist + query
  split/          pure split math (integer micro-USDC), rounding policy — unit-tested first
  storage/        Supabase Storage, signed URLs
  youtube/        YouTube OAuth + Data API (the import supply path)
```

Outside `src/server`:
- **Demo agent harness** — a Claude subagent that drives the MCP/REST/x402 loop
  from *outside* the product (a demo driver, not Findling's productized agent).
  Lives at `scripts/demo-agent/`.

Boundaries (do not violate):
- Catalog/Search never touch Gateway internals or split math.
- Payment never calculates creator/finder/platform shares (that is Split).
- Split is pure and unit-tested before payment integration.
- Findling does **not** build the consumer agent — `agent/` exposes the
  marketplace (MCP/REST/x402) to external agents.
