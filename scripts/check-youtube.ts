import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql, { schema });
  const u = (
    await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, process.env.DEV_USER_ID!))
  )[0];
  console.log(
    JSON.stringify({
      channelId: u?.youtubeChannelId ?? null,
      channelTitle: u?.youtubeChannelTitle ?? null,
      connectedAt: u?.youtubeConnectedAt ?? null,
      hasRefreshToken: !!u?.youtubeRefreshTokenCiphertext,
    }),
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
