# Findling — Architecture

Findling is an **agent-payable marketplace for licensable video moments**. This
document is the canonical, current description of how the system is built: its
components, the x402 payment path, the money/ledger model, the data model, and
the agent surfaces. Diagrams are [Mermaid](https://mermaid.js.org/) and render
inline on GitHub.

For an autonomous agent's how-to (the live, executable version), fetch
[`/skill.md`](../src/app/skill.md/route.ts) from a running instance. For the raw
schema, read [`src/server/db/schema.ts`](../src/server/db/schema.ts) — it is the
single source of truth and supersedes any prose here if they ever disagree.

---

## 1. System context

```mermaid
flowchart TB
    subgraph Actors
        BUY["Buyer agent"]
        FIND["Finder agent"]
        CRE["Creator (human)"]
    end

    subgraph App["Findling — Next.js 16 (App Router)"]
        STUDIO["Creator Studio<br/>(RSC web UI)"]
        AGENTAPI["Agent REST API<br/>/api/agent/*"]
        MCP["MCP server<br/>(hosted /api/mcp + stdio)"]
        UNLOCK["x402 unlock route<br/>/api/payments/x402/.../unlock"]
        SETTLE["Settlement + split<br/>(ledger)"]
        SEARCH["Search<br/>(embeddings + pgvector)"]
        AUTH["Auth<br/>(SIWE · agent keys · grants)"]
    end

    DB[("Postgres + pgvector<br/>(Supabase pooler)")]
    STORE[("Object storage<br/>clips · posters · previews")]
    EMB["Local embedding model<br/>bge-small-en-v1.5 (384-dim)"]
    GW["Circle Gateway<br/>@circle-fin/x402-batching"]
    ARC["Arc testnet<br/>USDC (native) · chain 5042002"]

    CRE --> STUDIO
    BUY <--> AGENTAPI
    BUY <--> MCP
    FIND --> AGENTAPI
    FIND --> MCP
    AGENTAPI --> UNLOCK
    MCP -.->|mirrors| AGENTAPI
    UNLOCK --> SETTLE
    AGENTAPI --> SEARCH
    SEARCH --> EMB
    SEARCH --> DB
    STUDIO --> DB
    STUDIO --> STORE
    AGENTAPI --> AUTH
    SETTLE --> DB
    SETTLE -->|settle + payout| GW
    GW --> ARC
```

**Key boundaries**

- **Findling never holds a buyer's private key.** Discovery returns a moment's
  `unlockUrl`; the agent pays it with its **own** funded session key via
  `GatewayClient.pay()`. Findling is the *resource server / facilitator*, not a
  custodian.
- **The web Studio and the agent API are the same app**, sharing one catalog,
  ledger, and settlement path. The MCP server mirrors the REST agent surface so a
  consumer agent can drive the identical loop over stdio.
- **Embeddings are computed locally** (no external embedding API) and stored in
  pgvector; search is an HNSW cosine query.

---

## 2. Component layering

Routes validate and orchestrate, delegating domain rules to `src/server/*`
services that own the transaction boundaries. Routes lean on those services for
all writes; a few read-heavy routes (e.g. the x402 unlock route) also issue
direct Drizzle reads for the resource/eligibility checks they orchestrate.

```mermaid
flowchart TB
    subgraph Edge["src/app — routes (validate + orchestrate)"]
        R1["/api/agent/* · /api/auth/* · /api/payments/*"]
        R2["Studio pages (RSC) · /r/:slug · /trace/:runId · /skill.md"]
    end
    subgraph Domain["src/server — services (own the rules + tx boundaries)"]
        AGENT["agent/ — search, ranking, run trace"]
        CATALOG["catalog/ — asset/clip/moment writes · studio + tx read-models"]
        LEDGER["ledger/ — earnings, settlement split, withdrawals"]
        PAYMENT["payment/ — gateway x402 provider (+ mock)"]
        SEARCHS["search/ — embeddings + retrieval"]
        AUTHS["auth/ — SIWE, agent credentials, sessions, grants"]
        RECEIPT["receipt/ — public proof read-model"]
        MCPS["mcp/ — MCP server"]
    end
    DB[("db/ — Drizzle client + schema")]

    R1 --> AGENT & CATALOG & LEDGER & PAYMENT & AUTHS
    R2 --> CATALOG & LEDGER & RECEIPT
    MCPS --> AGENT & LEDGER & PAYMENT
    AGENT --> SEARCHS
    AGENT & CATALOG & LEDGER & PAYMENT & SEARCHS & AUTHS & RECEIPT --> DB
```

---

## 3. The x402 license flow (hardened)

The single most important path: how a buyer agent licenses a moment and how the
money splits. The unlock route is deliberately **grant-blind until payment is
proven**, verifies the payment **before** loading the grant, and **reserves the
spending cap atomically before settling** so two concurrent unlocks can never
exceed the cap.

```mermaid
sequenceDiagram
    autonumber
    participant A as Buyer agent
    participant U as Unlock route
    participant V as x402 verify (Gateway)
    participant L as Ledger / settlement
    participant G as Circle Gateway
    participant C as Arc (USDC)

    A->>U: GET unlock?grantId&agentRunId (no payment)
    Note over U: unpaid path is grant-blind —<br/>only checks a grant is required
    U-->>A: 402 Payment Required + challenge
    A->>G: pay challenge with funded session key
    A->>U: GET unlock + Payment-Signature
    U->>V: verify(payment)  [FIRST — before grant load]
    V-->>U: payer address + amount
    U->>L: load grant · assert payer == sessionKey · usage allowed
    U->>L: reserveGrantCap(amount)  [atomic, BEFORE settle]
    alt cap reserved
        U->>V: settle(payment)
        V->>G: move funds
        G->>C: USDC settles on Arc
        U->>L: recordSettlement — split 80/12/8 + receipt + finder attribution
        U-->>A: 200 + signed clip URL + receipt
    else cap exhausted but already licensed
        Note over U,L: replay fallback — re-issue prior content,<br/>no funds move
        U-->>A: 200 + signed clip URL (replayed)
    else cap exhausted, never licensed
        U-->>A: 403 cap exceeded
    end
```

**Finder attribution** (who earns the 12%) requires all of: the agent run used
*this* grant, the run's candidate set included *this* moment, and the attributed
finder is not the buyer. Otherwise the finder share rolls to the platform reserve.

**Provider selection** is env-driven and fail-closed:

- `getGatewayProvider()` — the real Arc x402 provider (needs
  `GATEWAY_FACILITATOR_URL`, `SELLER_ADDRESS`, `SELLER_PRIVATE_KEY`).
- `getPayoutProvider()` — the real Gateway when `PAYMENT_PROVIDER=gateway_x402`,
  else a deterministic mock — **refused in production** so a misconfig can never
  mint a fake "succeeded" payout.

---

## 4. The two-sided agent economy & money split

Agents are first-class on **both** sides of the market.

```mermaid
flowchart LR
    BUY["Buyer agent<br/>pays gross USDC"] --> SPLIT{{"Split at settlement"}}
    SPLIT -->|80%| CRE["Creator"]
    SPLIT -->|12%| FIN["Finder<br/>(human or agent)"]
    SPLIT -->|8%| PLAT["Platform"]

    CRE --> LED["Ledger accrual<br/>(creator + finder roles)"]
    FIN --> LED
    LED -->|request_withdraw| PAYOUT["On-chain payout<br/>to registered Arc wallet"]
    PLAT --> RES["Platform reserve"]
```

- A **finder agent** that curates a moment earns the 12% whenever a buyer agent
  later licenses that moment through its attribution — and can `request_withdraw`
  its balance to its own wallet, fully autonomously.
- Earnings are derived, not stored as a balance: `accrued = Σ settled split legs
  for this user`; `withdrawn = Σ counted withdrawals`; `withdrawable = accrued −
  withdrawn`. The studio's **Transactions ledger** folds credits (+) and payouts
  (−) into one running balance that reconciles exactly to "withdrawable now".

---

## 5. Settlement & ledger states

```mermaid
stateDiagram-v2
    [*] --> pending: purchase created
    pending --> settled: verify + reserve cap + settle
    pending --> failed: verify/settle error
    settled --> [*]

    state Withdrawal {
        [*] --> requested
        requested --> submitted: provider accepted
        submitted --> succeeded: tx confirmed (hash)
        requested --> failed
        submitted --> failed
    }
```

A withdrawal counts against the balance from `requested` onward (`requested`,
`submitted`, `succeeded`); a `failed` payout frees the balance again. The same
status set drives both `getEarnings()` and the Transactions ledger's running
balance, so the two never disagree. USDC amounts are integer micro-USDC and
displayed at 3–6 dp so a sub-cent split leg (e.g. a 12% finder share of $0.07 =
0.0084) renders exactly and reconciles with its percentage.

---

## 6. Data model

Core entities and their relationships (see `schema.ts` for every column,
constraint, and index):

```mermaid
erDiagram
    USERS ||--o{ ASSETS : creates
    USERS ||--o{ MOMENTS : owns
    USERS ||--o{ CURATIONS : "finds (finder)"
    USERS ||--o{ PURCHASES : "buys (buyer)"
    USERS ||--o{ WITHDRAWALS : "withdraws"
    USERS ||--o{ AGENT_CREDENTIALS : "holds keys"
    USERS ||--o{ BUYER_SESSION_GRANTS : "authorizes"
    USERS ||--o{ AGENT_RUNS : "runs"

    ASSETS ||--o{ CLIP_JOBS : "clipped by"
    ASSETS ||--o{ MOMENTS : "yields"
    MOMENTS ||--o{ MOMENT_EMBEDDINGS : "embedded as"
    MOMENTS ||--o{ CURATIONS : "curated as"
    MOMENTS ||--o{ PURCHASES : "licensed via"

    BUYER_SESSION_GRANTS ||--o{ PURCHASES : "funds"
    BUYER_SESSION_GRANTS ||--o{ AGENT_RUNS : "scopes"
    AGENT_RUNS ||--o{ PURCHASES : "leads to"
    PURCHASES ||--|| RECEIPTS : "proven by"

    PURCHASES {
        uuid id
        bigint gross_micro_usdc
        bigint creator_micro_usdc
        bigint finder_micro_usdc
        bigint platform_micro_usdc
        string status
        string payment_reference
    }
    MOMENTS {
        uuid id
        bigint price_micro_usdc
        string usage_type
        string status
        string embedding_status
    }
    WITHDRAWALS {
        uuid id
        string role
        bigint amount_micro_usdc
        string status
        string transaction_hash
    }
```

Invariants enforced at the DB level include: a settled purchase's split **sums to
gross** with no negative legs; one settled payment reference maps to at most one
purchase; one receipt per purchase; a positive moment price; and a single tx
hash maps to at most one withdrawal row.

---

## 7. Supply & search pipeline

How a moment comes to exist and becomes discoverable:

```mermaid
flowchart LR
    subgraph Ingest
        UP["Upload"] --> ASSET
        YT["YouTube import<br/>(channel-control)"] --> ASSET["Asset<br/>(rights-attested)"]
    end
    ASSET --> JOB["Clip job<br/>ffmpeg: trim · poster · watermarked preview"]
    JOB --> MOM["Moment<br/>(priced, usage-typed)"]
    MOM --> EMB["Embed text<br/>bge-small-en-v1.5 → 384-dim"]
    EMB --> PGV[("pgvector<br/>HNSW cosine")]
    Q["Agent query"] --> EMBQ["Embed query"] --> PGV
    PGV --> RANK["Rank eligible candidates<br/>(published · hosted · in-budget)"]
    RANK --> RUN["Agent run<br/>(traceable)"]
```

Ownership is attested per asset — **contributor attestation** (uploads) or
**channel control** (YouTube imports) — and snapshotted onto the receipt at
settlement so a license stays provable even if the source row later changes. The
public Feed/preview only ever signs the low-res **watermarked preview**; the
full-quality clip is signed **only after** payment, on the unlock route.

---

## 8. Auth & identity

Two identity types share one resolver (`getActor`): human sessions and agent keys.

```mermaid
flowchart TB
    subgraph Human
        N1["GET /api/auth/nonce<br/>(single-use, cookie-bound)"] --> S1["sign SIWE (EIP-4361)"]
        S1 --> V1["POST /api/auth/verify"]
        V1 --> COOK["HMAC session cookie<br/>findling_session"]
    end
    subgraph Agent
        N2["GET /api/auth/nonce"] --> S2["sign SIWE"]
        S2 --> V2["POST /api/agent/auth"]
        V2 --> KEY["bearer key fdl_agent_…<br/>(sha256-hashed at rest)"]
    end
    COOK --> ACTOR["getActor(req)"]
    KEY --> ACTOR
    ACTOR --> SCOPE["owner-scoped reads/writes<br/>(earn/withdraw only for self)"]

    subgraph Spending
        GRANT["Buyer session grant<br/>session-key address + caps<br/>(total · per-purchase · expiry · usage)"]
    end
    KEY -.->|authorizes| GRANT
    GRANT -.->|reserved at settle| SCOPE
```

The login nonce is single-use and **bound to the cookie** it was issued with, so a
captured signature can't be replayed and a signature minted for another site
can't be reused here. A buyer session grant stores only the funded session key's
**address** (never a private key) plus the caps that bound its autonomous spend.

---

## 9. Agent surfaces (reference)

Same capabilities over REST and MCP. Auth is `Authorization: Bearer <fdl_agent_…>`
(REST) or `FINDLING_AGENT_KEY` (MCP).

| Capability | REST | MCP tool |
| --- | --- | --- |
| Register agent (SIWE) | `POST /api/agent/auth` | — (use REST once) |
| Discover moments | `POST /api/agent/search` | `search_moments` |
| Moment detail + unlockUrl | `GET /api/agent/moments/{id}` | `get_moment` |
| License (pay x402) | `GET /api/payments/x402/moments/{id}/unlock` | (pay `unlockUrl`) |
| Curate (earn 12%) | `POST /api/agent/curations` | `submit_curation` |
| Earnings | `GET /api/agent/earnings` | `get_earnings` |
| Withdraw on-chain | `POST /api/earnings/withdraw` | `request_withdraw` |
| Trace a run | `GET /api/agent/runs/{id}` | `get_agent_run` |

Every search→pick→pay→settle is captured as an **agent run** (`/trace/{runId}`)
and every settled license as a public **receipt** (`/r/{slug}`) — the Agentic
audit trail.

---

## 10. Security properties (summary)

- **No custody** — Findling never stores a buyer key; agents pay from their own
  session key. Grants store only the session-key *address* + caps.
- **Cap safety** — the spend cap is reserved atomically **before** settlement, so
  concurrent unlocks can't exceed it; an exhausted-but-already-licensed unlock
  replays prior content with no funds moved.
- **Payment-first, grant-blind** — the unpaid path leaks no grant state; the grant
  is loaded only after the payment verifies.
- **Fail-closed payouts** — mock payouts are refused in production; a real payout
  requires `PAYMENT_PROVIDER=gateway_x402` and a funded seller Gateway balance.
- **Owner-scoped money** — an actor can only read its own ledger and withdraw its
  own balance; a credit row exposes only that user's share, never the gross.
- **DB-enforced invariants** — split sums to gross, no negative legs, one receipt
  per purchase, one tx-hash per withdrawal, positive prices.
