# Findling — Aggressive Audit Report

_Date: 2026-06-20 · Scope: full repo (~13k LOC `src`, ~3.4k LOC `scripts`, docs)_

## How this was produced (and how much to trust it)

18 specialized finders fanned out across security / correctness / docs dimensions,
then **every** finding was adversarially re-verified against the real code by a
skeptical agent (default: assume the claim is wrong until the code proves it).
The first verification pass was partly lost to API rate-limiting, so all affected
findings were re-verified in a second pass. The verifiers **rejected 7 findings as
false positives** and **down-graded inflated severities** on ~10 more — those
corrections are reflected below, and the rejects are listed in the last section
for transparency.

Headline crown-jewel paths (x402 unlock ordering, withdrawal double-pay guard,
agent-key handling, MCP auth) were additionally read end-to-end by hand.

**Independent cross-check (Codex / gpt-5.5, xhigh).** The whole report was then
re-verified by a separate model against the code. It **confirmed all 11 headline
findings** (H1, H2, M1–M9) with its own file:line evidence — including
reproducing the M8 `db:migrate` failure in a clean env and a repo-wide search
confirming H1 has no reconciliation path. Its corrections are merged below:
three items were narrowed (CSRF, curation, receipt page), several Medium
severities were classified closer to Low, and it surfaced one issue this audit had
missed (**C1**, the publishing-flow gap).

## Remediation status (2026-06-20)

Fixes below are verified green by `pnpm preflight` (lint + tsc + vitest + build; 50 tests) and a second independent Codex pass over the new code (which caught 3 issues in the first cut — non-idempotent publish, a reconcile path that could mark success without a tx hash, and a provider-ok-without-hash case — all now fixed).

**Fixed**
- **H1** — withdrawal reconciliation now exists: `listSubmittedWithdrawals` / `reconcileSubmittedWithdrawal` + `scripts/reconcile-withdrawals.ts`; and a provider "ok" with no tx hash is now held as `submitted` for reconciliation instead of recorded as proven success.
- **H2** — `skill.md` examples `export` and double-quote the key.
- **C1 (publish flow — fully wired)** — direct uploads now create a draft *moment* (atomic asset+moment via `completeUpload`, server-probed duration enforcing ≤60s, default price) — previously they created only an asset. `publishMoment` (idempotent, race-safe) + `POST /api/creator/moments/[id]/publish` + a **Publish button** in the Clips UI flip draft → published and embed it; the studio cache is busted with `revalidateTag(..., "max")` after upload and publish.
- **M1** CSPRNG SIWE nonce · **M2** search clamp · **M3/M4** upload byte-sniff + reject-cleanup · **M5** token-key strength floor + deploy gate · **M6** VS Code MCP config · **M7** chain-id/idempotency docstrings · **M8/M9** `db:migrate`/`tsx` env loading.
- **LOW/INFO** — CSRF on logout/username/payout-wallet, MCP `uuid()` validation + `failureReason`, curation/search input bounds, OAuth scope trim, split ceiling, per-role drift warning, dead `userId` / stale `?userId` / CopyButton catch, and the doc corrections (project-name cleanup, ARCHITECTURE "never touch DB", README routes/MCP/split, AGENTS.md onboarding, `.env.example`).

**Deferred (documented, lower-risk)**
- **x402 resource-binding & settle payer re-assert** (LOW) — they change the live signed payment requirements; need live x402 testing before touching the money path.
- **YouTube-import transaction, nonce-table cleanup, getStudioData concurrency, generateMetadata** (LOW) — safe to batch later.

**Won't fix (intentional)**
- Stateless-session revocation (by design), `/r/[slug]` public receipt (documented shareable proof), AES-GCM AAD (sound as-is), SIWE `notBefore` (viem validates), unused gas-buffer columns.

## Overall posture

**The money/auth core is genuinely well-engineered.** Independently confirmed as
correct and well-defended:

- **x402 unlock** ([unlock/route.ts](../src/app/api/payments/x402/moments/[momentId]/unlock/route.ts)) — verify-before-settle, payer bound to the grant's session key, grant cap **reserved atomically before** the irreversible settle, idempotency keyed on the on-chain tx, content released only after a recorded settlement.
- **Withdrawal double-pay guard** ([withdrawal.ts](../src/server/ledger/withdrawal.ts)) — `pg_advisory_xact_lock` serializes per user+role, balance re-derived inside the lock, and `COUNTED_WITHDRAWAL_STATUSES` counts in-flight `requested` rows so a concurrent call sees zero withdrawable.
- **Payment requirements rebuilt server-side** from the live DB price on both verify and settle — never trusted from the buyer.
- **Agent keys** stored as SHA-256 of 256-bit random tokens (plaintext shown once), with revocation + expiry checked on every call; **MCP route authenticates before any tool is constructed**.
- **YouTube OAuth state** is HMAC-signed, session-cookie-bound, expiring, and compared with `timingSafeEqual`.

The findings below are real but are mostly **hardening, robustness, and
documentation** issues layered on a sound design — not a broken core.

---

## CRITICAL
None found.

## HIGH

### H1 · Failed withdrawals lock funds forever — the promised reconciliation does not exist
`src/server/ledger/withdrawal.ts:91-107` · also `unlock/route.ts:206-218, 280-289`

When `provider.withdraw()` throws (timeout / RPC error / unknown outcome) the row
is parked as `submitted`, and `submitted` is in `COUNTED_WITHDRAWAL_STATUSES`
([earnings.ts:32](../src/server/ledger/earnings.ts#L34)), so it **permanently**
reduces the user's `withdrawableMicroUsdc`. The comment says "held for
reconciliation," but a repo-wide search confirms **no job, endpoint, or script
ever moves a row out of `submitted`** (the word "reconcil*" appears only in
comments). The identical pattern exists in the unlock route: a `settle()`
exception keeps the grant cap reserved "for reconciliation" that is never run,
locking that buyer's grant cap.

This is the correct *fail-safe* (favor "never double-pay" over "never lock"), but
without the reconciliation tooling, **any transient Gateway hiccup permanently
strands a creator's/finder's earned balance** with no recovery path.

**Fix:** Build the reconciliation the comments promise — a job/endpoint that, for
each `submitted` withdrawal (and each orphaned reserved grant cap), queries the
provider/chain by recipient+amount+window and promotes to `succeeded` or releases
to `failed`. Until then, document the manual recovery procedure.

### C1 · No in-app path publishes a moment — the creator→discoverable flow can't complete (found by Codex cross-check)
`src/server/catalog/catalog.ts` · `src/server/search/embeddings.ts:174-182` · `scripts/new-moment.ts:76`

Moments are created as `draft`, and agent search only returns `published`
([embeddings.ts:178](../src/server/search/embeddings.ts#L178)), but the **only
code that sets `moments.status = "published"` is in `scripts/`**
(`new-moment.ts`, `smoke-search.ts`) — no API route, server action, or UI
transitions a moment to published. So a creator using the app/UI can upload and
price a moment but can never make it discoverable to agents; the demo works only
because moments are seeded by scripts. This is the most material *product*
correctness gap — easy to miss because every individual route works in isolation.

**Severity:** Medium (product-completeness; not a security hole). **Fix:** add a
publish action/route (with attestation + ownership checks) that flips `draft →
published`, or document that publishing is intentionally script-only for the demo.

### H2 · `skill.md` agent-onboarding examples are broken — copy-paste auth always 401s
`src/app/skill.md/route.ts:64-122`

The agent-facing skill doc's curl examples send
`-H 'Authorization: Bearer $FINDLING_AGENT_KEY'` in **single quotes**, so bash
never expands the variable — and the doc **never assigns** `FINDLING_AGENT_KEY`
anywhere (step 0 returns the key as `apiKey` in a comment only). A programmatic
agent copying these examples sends the literal string `$FINDLING_AGENT_KEY` and
gets 401 on every call. (An LLM agent reading the prose may self-correct, which is
why this is "high doc bug" rather than "high security bug.")

**Fix:** After step 0, show `export FINDLING_AGENT_KEY=fdl_agent_...`, and switch
the call examples to double quotes (`-H "Authorization: Bearer $FINDLING_AGENT_KEY"`).
Also reconcile the naming: `FINDLING_AGENT_KEY` is the **MCP** env var name, conflated
here with a shell var on the REST examples.

---

## MEDIUM

### Security

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| M1 | **SIWE nonce uses a non-CSPRNG.** `generateSiweNonce()` → viem `uid()` fills a module buffer from `Math.random()` and shifts it by one char per call, so successive nonces share 95/96 chars and are predictable from the public `GET /api/auth/nonce`. Account takeover is still blocked (signature + httpOnly cookie required), so this is defense-in-depth, not a break. | [siwe.ts:49](../src/server/auth/siwe.ts#L49) | Use `randomBytes(24).toString("base64url")` — matches the CSPRNG pattern already used for agent keys. |
| M2 | **Unbounded `limit` on REST search → authenticated DoS.** Client `limit` flows straight into the SQL `LIMIT` with no coercion/cap (the MCP twin *does* clamp). | [search/route.ts:38](../src/app/api/agent/search/route.ts#L38) | Clamp: `Math.min(Math.max(trunc(limit ?? 8),1),25)`; share one zod schema with MCP. |
| M3 | **Upload content-type allowlist is bypassable.** The `complete` route checks `info.contentType`, which is the **client-supplied** `Content-Type` header echoed back from Supabase object metadata — no byte/magic sniffing. The comment claiming the clip worker ffprobes the file is wrong (the worker only handles `sourceType==="youtube"`). Blast radius is currently limited because raw `originalStorageKey` isn't wired to a buyer-served path — but the control is defeated. | [uploads/complete/route.ts:63-90](../src/app/api/creator/uploads/complete/route.ts#L63) | Sniff real bytes (ffprobe/magic) server-side before accept; set safe `Content-Type`/`Content-Disposition` whenever raw uploads are ever served; fix the misleading comments. |
| M4 | **No *upload-time* size cap; no cleanup of rejected/orphaned uploads.** _(Per Codex: `complete` does enforce a server-side acceptance cap on the real measured size — [complete/route.ts:85-90](../src/app/api/creator/uploads/complete/route.ts#L85) — so this is PARTIAL.)_ The gap: presign mints a signed URL with no size constraint (a client can still upload huge bytes that are only rejected *after* landing), and rejected objects are never removed even though `removeObject()` exists. | [presign/route.ts:38-49](../src/app/api/creator/uploads/presign/route.ts#L38), [supabase-storage.ts:61-66](../src/server/storage/supabase-storage.ts#L61) | Constrain size at presign if the storage API allows; call `removeObject()` on validation failure in `complete`. |
| M5 | **`YOUTUBE_TOKEN_ENC_KEY` accepts arbitrarily weak passphrases.** The fallback branch scrypt-derives a key from *any* string with a **hardcoded salt** (`"findling-youtube-token"`) and default cost, no strength floor; `deploy:check` validates presence only, and the default `deploy:check` skips YouTube vars entirely (only `deploy:check:full` covers them). Operators following the docs (`openssl rand -hex 32`) are fine — but a weak key is silently accepted. Protects YouTube OAuth tokens (not money). | [token-crypto.ts:43-50](../src/server/crypto/token-crypto.ts#L43), [check-deploy-env.mjs:141](../scripts/check-deploy-env.mjs) | Require ≥32 bytes of entropy or reject the passphrase branch in production; per-key random salt; gate the key in the default `deploy:check`. |

### Correctness

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| M6 | **VS Code MCP config snippet drops the bearer token.** The UI emits VS Code config with auth under `requestInit.headers`, but VS Code expects top-level `headers`, so every tool call 401s. | [agents-panel.tsx:605-617](../src/components/studio/agents-panel.tsx#L605) | Emit `{ servers: { findling: { type:"http", url, headers:{ Authorization } } } }`; reserve `requestInit` for the SDK smoke client. |
| M7 | **`types.ts` mislabels the chain identifier** — `"arcTestnet"` (a chain *name*) is commented as a "Chain id," and two undocumented network-id formats (`"arcTestnet"` vs CAIP-2 `eip155:5042002`) coexist on the money path with no note on which goes where. | [payment/types.ts](../src/server/payment/types.ts) | Fix the comment; document the two formats and their boundaries. |

### Documentation

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| M8 | **`pnpm db:migrate` fails as documented.** `drizzle.config.ts` reads `process.env.DATABASE_URL ?? ""` and drizzle-kit does **not** auto-load `.env.local` → empty URL, cryptic failure for any new dev. | [drizzle.config.ts:8](../drizzle.config.ts#L8), [DEPLOYMENT.md:66](DEPLOYMENT.md) | Load `.env.local` in the config (e.g. dotenv) or document `--env-file`/export; same fix needed for the `tsx` script commands (M9). |
| M9 | **DEPLOYMENT.md `tsx` commands omit `--env-file=.env.local`**, so `reembed.ts`, `smoke-arc-live.ts`, etc. can't reach the DB as written. | [DEPLOYMENT.md:75,89](DEPLOYMENT.md) | Add `--env-file=.env.local` (or document exporting env). |

---

## LOW & INFO (grouped)

### Auth / session (security)
- **No CSRF defense beyond `SameSite=lax`** on these state-changing auth routes: logout/username/payout-wallet — no Origin/Referer check, no middleware. Note (per Codex): the `/api/earnings/withdraw` route **already implements** the exact Origin-host check these should copy ([withdraw/route.ts:20-31](../src/app/api/earnings/withdraw/route.ts#L20)), so the fix is to apply that same guard to the three auth routes. — [session.ts:66](../src/server/auth/session.ts#L66) _(LOW)_
- **Payout-wallet change requires no step-up re-auth** — a session alone can redirect future earnings. — [payout-wallet/route.ts:12](../src/app/api/auth/payout-wallet/route.ts#L12) _(LOW)_
- **Stateless sessions can't be revoked** — logout only clears the client cookie; a stolen cookie stays valid until expiry. — [session.ts:77](../src/server/auth/session.ts#L77) _(LOW)_
- **Expired/consumed SIWE nonces are never pruned** → unbounded `siwe_nonces` growth. — [siwe.ts:48](../src/server/auth/siwe.ts#L48) _(LOW)_
- **SIWE verify ignores `notBefore` and `chainId`** in the message. — [siwe.ts:98](../src/server/auth/siwe.ts#L98) _(INFO)_
- **`.env.example` says `AUTH_SESSION_SECRET` needs ≥16 chars; code enforces ≥32** — copy the 16-char guidance and login breaks at boot. — [.env.example](../.env.example) _(LOW, also docs)_

### Payments / grants / ledger
- **x402 payment not cryptographically bound to the specific moment** — `resource` is omitted from the verify/settle requirements; binding relies on server-side price rebuild + payer-grant check rather than the signed resource URL. — [gateway-x402-provider.ts:149-161](../src/server/payment/gateway-x402-provider.ts#L149) _(LOW)_
- **`settle()` payer not re-asserted on the reserved-cap path** — payer is bound at verify; a re-assert before/after settle would harden the irreversible step. — [unlock/route.ts:123-129](../src/app/api/payments/x402/moments/[momentId]/unlock/route.ts#L123) _(LOW)_
- **Grant creation has no role check** — any authenticated identity can create a buyer spending envelope. — [session-grants/route.ts:19-48](../src/app/api/agent/session-grants/route.ts#L19) _(LOW)_
- **`gasBufferMicroUsdc` / `gatewayBalanceReference` grant columns are defined but never enforced** — the implied gas-headroom guarantee doesn't exist. — [schema.ts:331-335](../src/server/db/schema.ts#L331) _(LOW)_
- **`computeSplit` doesn't enforce its documented gross ceiling**; very large amounts lose precision in `Number(BigInt)` and can break the sum-to-gross invariant. — [split.ts:32-43](../src/server/split/split.ts#L32) _(LOW)_
- **Per-role withdrawable is silently `max(0,…)`-clamped**, hiding ledger drift if withdrawn ever exceeds accrued. — [earnings.ts:94-99](../src/server/ledger/earnings.ts#L94) _(LOW)_
- **USDC asset chosen with a permissive `assets[0]` fallback** from the facilitator response. — [gateway-x402-provider.ts:123-133](../src/server/payment/gateway-x402-provider.ts#L123) _(INFO)_
- **Replay-after-cap path requires `agentRunId`** — a direct (non-agent) buyer who exactly hits the cap gets a spurious `over_remaining_cap` 403 instead of their already-paid content. — [unlock/route.ts](../src/app/api/payments/x402/moments/[momentId]/unlock/route.ts) _(LOW)_

### Crypto (acceptable, noted)
- **AES-256-GCM token cipher omits AAD and doesn't validate IV/tag lengths on decrypt** — fine for confidentiality+integrity of the token; AAD would harden context-binding. — [token-crypto.ts:29-38](../src/server/crypto/token-crypto.ts#L29) _(INFO)_
- **Agent keys hashed with unsalted SHA-256** — acceptable given 256-bit random entropy; would be brittle if entropy ever dropped. — [agent-credential.ts:14-16](../src/server/auth/agent-credential.ts#L14) _(INFO)_

### Input validation / DoS (security)
- **Curation tags/caption/notes have no length/count limits** → unbounded-input / storage abuse. _(Correction per Codex: the original "re-embed on every upsert" claim is **wrong** — `curation.ts` has no embedding call; the real issue is only the missing input bounds.)_ — [curations/route.ts:18-42](../src/app/api/agent/curations/route.ts#L18) _(LOW)_
- **Embedding query/source text length unbounded** before hitting a paid provider. — [embeddings.ts:167](../src/server/search/embeddings.ts#L167) _(LOW)_
- **Routes hand-roll `typeof` checks instead of zod**, leaving boundary inputs under-validated. — [search/route.ts:18](../src/app/api/agent/search/route.ts#L18) _(LOW)_
- **MCP id-taking tools skip the UUID validation their REST twins enforce** → raw Postgres errors leak to the caller. — [mcp/server.ts:82-153](../src/server/mcp/server.ts#L82) _(LOW)_
- **`CLIP_TMP_DIR` defaults to a shared world-readable `/tmp` path**, not covered by the deploy gate. — [clip-worker.ts](../src/server/clip/clip-worker.ts) _(LOW)_
- **60s clip-duration limit never enforced server-side for direct uploads** (comment claims a probe that never runs). — [complete/route.ts:92-103](../src/app/api/creator/uploads/complete/route.ts#L92) _(LOW)_
- **`complete` route is replayable** — no uniqueness on `originalStorageKey`, so one upload can mint many draft assets. — [complete/route.ts](../src/app/api/creator/uploads/complete/route.ts) _(LOW)_
- **YouTube OAuth requests over-broad scopes** (`openid`, `email`, `profile`) that are never used. — [youtube/oauth.ts:9-14](../src/server/youtube/oauth.ts#L9) _(LOW)_

### Data exposure (security)
- **`/trace/[runId]` is public and unauthenticated** — leaks any buyer's private run (ranked candidates, attribution, payment) with no owner check, contradicting the owner-only API guard on the same resource ([runs/[agentRunId]/route.ts:15-29](../src/app/api/agent/runs/[agentRunId]/route.ts#L15)). This is the genuine unintended leak. — [trace/[runId]/page.tsx:33](../src/app/trace/[runId]/page.tsx#L33) _(LOW–MEDIUM)_
- **`/r/[slug]` receipt page** also returns the full economic record (gross, 80/12/8 split, payer address) to anyone with the slug — but _(per Codex)_ the receipt code explicitly documents this as a public/shareable proof ([receipt.ts:1-5](../src/server/receipt/receipt.ts#L1)), so this half is an **intentional product decision**, not a bug. Worth confirming the split amounts/payer are acceptable to expose publicly. _(INFO)_

### Correctness (non-money)
- **`getStudioData` fans out one Supabase signed-URL request per moment in an unbounded `Promise.all`.** — [studio.ts](../src/server/catalog/studio.ts) _(LOW)_
- **YouTube import: `completeImportedMoment` runs outside a transaction** after a successful clip job, no compensation → orphaned asset/clip-job rows + storage objects on partial failure. — [youtube/imports/route.ts](../src/app/api/creator/youtube/imports/route.ts) _(LOW)_
- **`/earnings` redirect forwards a `?userId` param the target now ignores** (stale post-IDOR-fix behavior). — [earnings/page.tsx:15-16](../src/app/earnings/page.tsx#L15) _(LOW)_
- **`moment.durationMs` comes from the real clip while `startMs/endMs` come from the request**, with no invariant tying them. — [youtube/imports/route.ts](../src/app/api/creator/youtube/imports/route.ts) _(INFO)_

### Frontend
- **`CopyButton` clipboard write has no rejection handler** — the one-time API-key copy can silently no-op. — [agents-panel.tsx](../src/components/studio/agents-panel.tsx) _(LOW)_
- **`WithdrawButton` sends a body `userId` the server intentionally ignores** — dead/misleading client trust signal. — [withdraw-button.tsx](../src/components/earnings/withdraw-button.tsx) _(INFO)_

### Documentation shortcomings
- **`ARCHITECTURE.md` claims "routes never touch the DB directly" — false** (e.g. the unlock route queries the DB directly throughout). — [ARCHITECTURE.md](ARCHITECTURE.md) _(LOW)_
- **README claims all agent capabilities live on `/api/agent/*` — two don't** (`/api/payments/x402/.../unlock`, `/api/earnings/withdraw`). — [README.md](../README.md) _(LOW)_
- **README repo map omits `src/server/split` and miscredits the settlement split to `ledger/`.** — [README.md](../README.md) _(LOW)_
- **Hosted HTTP MCP endpoint (`/api/mcp`) is undocumented** — README/ARCHITECTURE describe MCP as stdio-only. — [README.md](../README.md) _(LOW)_
- **`AGENTS.md` is Next.js boilerplate only** (5 lines) — no contributor/onboarding guidance for a payments-heavy, Next-16-quirky codebase. — [AGENTS.md](../AGENTS.md) _(LOW)_
- **Supabase storage bucket name `moments` is hardcoded and never documented** as a setup step. — [supabase-storage.ts](../src/server/storage/supabase-storage.ts) _(LOW)_
- **Google OAuth / YouTube Data API client setup steps are missing** (env vars listed, but not the Cloud Console steps). _(LOW)_
- **Two inconsistent sources of env truth:** `.env.example` vs `DEPLOYMENT.md §1`. Undocumented-but-read vars: `WITHDRAW_MAX_FEE_USDC`, `GOOGLE_API_KEY` (Gemini fallback), `FINDLING_AGENT_KEY` (stdio MCP). — [.env.example](../.env.example) _(LOW/INFO)_
- **`unstable_cache` is soft-deprecated in Next 16** (favor the `use cache` directive). — [stats.ts](../src/server/catalog/stats.ts) _(INFO)_
- **Public receipt/trace pages define no `generateMetadata`** — all inherit the generic root title/OG. — [r/[slug]/page.tsx](../src/app/r/[slug]/page.tsx) _(LOW)_
- **`token-crypto.ts` cipher + `keyFromEnv()` lack docstrings** stating what's protected, the IV-uniqueness invariant, and the silent base64/passphrase/scrypt ambiguity. — [token-crypto.ts](../src/server/crypto/token-crypto.ts) _(LOW)_
- **`request_withdraw` MCP tool omits the `failureReason`** the REST withdraw route returns. — [mcp/server.ts:195-201](../src/server/mcp/server.ts#L195) _(INFO)_

---

## Cross-cutting gaps (from the completeness critic)

1. **No application-wide rate limiting** — none of the auth, search, curation, import, or withdraw routes throttle. Amplifies the DoS findings (M2, curation/embedding) and enables nonce/login flooding.
2. **No proof-of-control on declared addresses** — `sessionKeyAddress` (grants) and `payoutWalletAddress` are accepted on the session's say-so with only a regex check. (For payout this is self-harm only; for session keys the unlock's payer==sessionKey check provides de-facto proof at spend time — but neither is proven at declaration.)
3. **Inline media processing in the request thread** — `runClipJob()` spawns yt-dlp (up to 80MB / 120s) + ffmpeg/ffprobe **synchronously inside the POST handler**; no queue/worker. Fragile under serverless timeouts and concurrent imports.
4. **`agent_runs` attribution write-path integrity** — the finder 12% is driven by `candidateMomentIds` / `sessionGrantId` / `startedAt` on agent-run rows; worth a focused review that these can't be forged to redirect attribution.

---

## Refuted / false positives (excluded after verification)

These were raised by finders but **disproven** on re-read — listed so they aren't re-investigated:

- ❌ "`getEarnings` clamp and the transaction ledger can drift apart" — they reconcile via shared balance-reducing statuses.
- ❌ "`verifySiwe` docstring omits expiry/notBefore" — the docstring says "domain + expiry," which matches; `notBefore` is handled by viem.
- ❌ "`MAX_FEE_USDC` default `2.01` has no docstring" — it does ([withdrawal.ts:12](../src/server/ledger/withdrawal.ts#L12)).
- ❌ "README quickstart lacks secrets-gen/troubleshooting" — README:180-191 covers it incl. `openssl`.
- ❌ "`EMBEDDING_PROVIDER` default annotation contradicts code" — `.env.example` sets it explicitly, so the unset branch never runs on the happy path.
- ❌ "`submitCuration` slug collision unhandled" — 48-bit random slug; collision is negligible and yields a clean constraint error, not a real fault.
- ❌ "`skill.md` never assigns the key" — folded into H2 (the single-quote bug is the real, confirmed issue).
- ❌ (caught during hand-review) "`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` are stale/unused" — they **are** used, via a dynamic `env(name)` helper.
- ❌ (caught during hand-review) "`DEV_USER_ID` is a dev auth bypass" — it's script-only; the runtime dev stub was removed.
