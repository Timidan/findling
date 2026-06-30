import postgres from "postgres";
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { prepare: false });
const rows = await sql`
  select relname as "table", relrowsecurity as "rls_enabled"
  from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r'
  order by relname`;
console.table(rows.map(r => ({ table: r.table, rls_enabled: r.rls_enabled })));
const off = rows.filter(r => !r.rls_enabled);
console.log(off.length === 0
  ? `\nALL ${rows.length} public tables have RLS ENABLED ✅`
  : `\n⚠️ ${off.length} table(s) still WITHOUT RLS: ${off.map(r => r.table).join(", ")}`);
await sql.end();
