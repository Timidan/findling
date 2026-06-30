import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Earnings now lives inside the creator console at `/studio/earnings`.
 * Keep this path working (older links, the public SiteHeader) by forwarding.
 * The target derives identity from the session, so no query param is forwarded
 * (the old `?userId` override is ignored downstream and is not propagated).
 */
export default async function EarningsRedirect() {
  redirect("/studio/earnings");
}
