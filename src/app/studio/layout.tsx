import { Suspense } from "react";
import { getStudioIdentity, studioHandle } from "@/server/catalog/studio";
import { StudioSidebar } from "@/components/studio/studio-sidebar";
import { SetUsernamePrompt } from "@/components/auth/set-username-prompt";
import { getSessionUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic"; // live creator context

function shortAddr(a: string | null): string | null {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null;
}

/**
 * The creator console shell — a persistent left rail (desktop) / top bar
 * (mobile) wrapping every `/studio/*` page: Home, Clips, Analytics, Earnings,
 * Payouts, Settings. The shell replaces the public SiteHeader inside the studio.
 */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground lg:flex">
      <Suspense
        fallback={<StudioSidebar creatorName="Creator" creatorSubtitle={null} />}
      >
        <StudioSidebarWithIdentity />
      </Suspense>
      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </main>
      <SetUsernamePrompt />
    </div>
  );
}

async function StudioSidebarWithIdentity() {
  // The rail identity reflects the SIGNED-IN user ONLY. Logged out, the studio is
  // a public catalog preview, but the rail must NOT show a specific account's
  // name/address — that read as "you're signed in as <default creator>" even
  // with no wallet connected.
  const sessionUser = await getSessionUser();
  const identity = sessionUser
    ? await getStudioIdentity(sessionUser.id).catch(() => null)
    : null;

  const creatorName = !sessionUser
    ? "Your studio"
    : identity
      ? studioHandle(identity)
      : (sessionUser.displayName ?? "Creator");
  const creatorSubtitle = sessionUser
    ? shortAddr(identity?.walletAddress ?? sessionUser.address ?? null)
    : null;

  return (
    <StudioSidebar
      creatorName={creatorName}
      creatorSubtitle={creatorSubtitle}
      initialUser={sessionUser}
    />
  );
}
