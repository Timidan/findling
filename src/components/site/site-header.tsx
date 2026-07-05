"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { FindlingLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ConnectWallet, type Me } from "@/components/auth/connect-wallet";

/**
 * Shared site chrome. The wallet button resolves auth state client-side, and
 * the top-level nav hides the public agent onboarding link once a user is signed
 * in.
 */

const NAV: { href: string; label: string; signedOutOnly?: boolean }[] = [
  { href: "/studio", label: "Studio" },
  { href: "/wanted", label: "Requests" },
  { href: "/agents", label: "For agents", signedOutOnly: true },
];

function isActiveHref(pathname: string, active: string | undefined, href: string) {
  if (active === href) return true;
  if (href === "/wanted") return pathname === "/wanted" || active === "/wanted";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({
  active,
  className,
  initialUser,
}: {
  /** href of the current section, to mark the active nav link */
  active?: string;
  /** accepted for older callers; page labels are not rendered beside wallet controls */
  tag?: string;
  className?: string;
  /** server-seeded session user (from the dynamic page) so the wallet button
   *  hydrates already-connected; omitted by the loading skeletons. */
  initialUser?: Me;
}) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | undefined>(initialUser);
  const walletKey =
    me?.id ?? me?.address ?? initialUser?.id ?? initialUser?.address ?? "signed-out";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-5 sm:justify-between sm:gap-6">
        <Link href="/" aria-label="Findling home" className="shrink-0">
          <FindlingLogo size="1.5rem" wordClassName="hidden text-2xl min-[390px]:inline" />
        </Link>

        {/* On phones the nav scrolls horizontally so every section stays reachable
            without forcing the row wider than the viewport. */}
        <nav
          className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-none sm:overflow-visible"
          aria-label="Primary"
        >
          {NAV.map((item) => {
            if (item.signedOutOnly && me !== null) return null;
            const isActive = isActiveHref(pathname, active, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 transition-colors",
                  isActive
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ConnectWallet
            key={walletKey}
            initialUser={me}
            onAuthChange={setMe}
            compactOnMobile
          />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
