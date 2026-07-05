import { getStudioIdentity, studioHandle } from "@/server/catalog/studio";
import { StudioSidebar } from "@/components/studio/studio-sidebar";
import { SetUsernamePrompt } from "@/components/auth/set-username-prompt";
import { getSessionUser } from "@/server/auth/current-user";
import { SiteHeader } from "@/components/site/site-header";

export const dynamic = "force-dynamic"; // live creator context

function shortAddr(a: string | null): string | null {
  return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : null;
}

/**
 * The creator console shell: persistent Studio navigation plus the global
 * header, so Studio pages can still reach Requests and account actions.
 */
export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    <div className="min-h-[100dvh] bg-background text-foreground lg:flex">
      <StudioSidebar
        creatorName={creatorName}
        creatorSubtitle={creatorSubtitle}
        initialUser={sessionUser}
      />
      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <SiteHeader active="/studio" initialUser={sessionUser} />
        {children}
      </main>
      <SetUsernamePrompt />
    </div>
  );
}
