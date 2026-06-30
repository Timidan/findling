import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const cols = await sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public'
      AND ((table_name='purchases' AND column_name IN ('session_grant_id','payer_address','attribution_reason','curation_score'))
        OR (table_name='receipts' AND column_name IN ('creator_id','finder_id','ownership_model','attestation_version','attestation_text','attestation_at')))
    ORDER BY table_name, column_name`;
  console.log("new columns:", cols.map((c) => `${c.table_name}.${c.column_name}`).join(", "));
  const checks = await sql`
    SELECT conname FROM pg_constraint
    WHERE contype='c' AND conname IN ('moments_price_positive','grants_caps_valid','withdrawals_amount_positive')
    ORDER BY conname`;
  console.log("checks:", checks.map((c) => c.conname).join(", "));
  const idx = await sql`
    SELECT indexname FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('receipts_purchase_id_unique','moment_embeddings_unique','grants_buyer_status_idx','grants_session_key_idx','grants_expires_idx','withdrawals_recipient_idx')
    ORDER BY indexname`;
  console.log("indexes/uniques:", idx.map((c) => c.indexname).join(", "));
  const m = await sql`SELECT title, duration_ms, price_micro_usdc, status FROM moments LIMIT 5`;
  console.log("moments rows:", JSON.stringify(m.map((r) => ({ title: r.title, durationMs: r.duration_ms, price: r.price_micro_usdc, status: r.status }))));
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
