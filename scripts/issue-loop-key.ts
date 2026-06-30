import { eq } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { issueAgentKey } from "../src/server/auth/agent-credential";

const EMAIL = "loop-buyer@findling.test";

(async () => {
  let u = (await db.select().from(users).where(eq(users.email, EMAIL)))[0];
  if (!u) {
    [u] = await db
      .insert(users)
      .values({ email: EMAIL, displayName: "Loop Buyer", roles: ["buyer", "finder"] })
      .returning();
  }
  const key = await issueAgentKey(u.id, "loop-buyer-subagent");
  console.log("AGENTKEY:" + key);
  process.exit(0);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
