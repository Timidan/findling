# Findling Context

## Domain Vocabulary

### License Purchase

A buyer's paid acquisition of a licensable moment. A License Purchase starts at
an x402 `unlockUrl`, verifies the buyer's payment, binds the payer to a Buyer
Session Grant, records the purchase and receipt, and returns a short-lived
download URL.

### Licensable Moment

A moment that can be sold right now: published, backed by a hosted clip,
ownership verified and attested, and attached to an asset that is not disabled
or under takedown.

### Buyer Session Grant

A buyer-created spending envelope for an agent-controlled session key. It owns
the total cap, per-purchase cap, expiry, allowed usage types, and remaining cap
that constrain delegated License Purchases.

### Agent Surface

The REST and MCP Interfaces that let outside agents search, inspect moments,
curate moments, inspect earnings, and withdraw their own accrued balances.
