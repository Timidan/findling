"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  FilmSlate,
  ChartLineUp,
  Coins,
  Wallet,
  GearSix,
  Robot,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { FindlingLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ConnectWallet, type Me } from "@/components/auth/connect-wallet";

/**
 * Creator console navigation. The shell is rendered by `studio/layout.tsx`;
 * this client component owns the nav so it can highlight the active route via
 * `usePathname` (layouts don't re-render on navigation, so the active state
 * must live in a client child). Active state uses ink/secondary — never amber,
 * which the brand reserves strictly for money.
 */

const ITEMS: { href: string; label: string; icon: Icon }[] = [
  { href: "/studio", label: "Home", icon: House },
  { href: "/studio/clips", label: "Clips", icon: FilmSlate },
  { href: "/studio/analytics", label: "Analytics", icon: ChartLineUp },
  { href: "/studio/earnings", label: "Earnings", icon: Coins },
  { href: "/studio/payouts", label: "Payouts", icon: Wallet },
  { href: "/studio/agents", label: "Agents", icon: Robot },
  { href: "/studio/settings", label: "Settings", icon: GearSix },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/studio" ? pathname === "/studio" : pathname.startsWith(href);
}

export function StudioSidebar({
  creatorName,
  creatorSubtitle,
  initialUser,
}: {
  creatorName: string;
  creatorSubtitle: string | null;
  /** server-seeded session user so the wallet button hydrates connected */
  initialUser?: Me;
}) {
  const isActive = useActive();
  const initial = creatorName.charAt(0).toUpperCase();

  return (
    <>
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
        <div className="px-5 py-6">
          <Link href="/" aria-label="Findling home">
            <FindlingLogo size="1.7rem" className="gap-2.5" wordClassName="text-2xl" />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3" aria-label="Studio">
          {ITEMS.map(({ href, label, icon: Ico }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sage" />
                )}
                <Ico
                  weight={active ? "fill" : "regular"}
                  className={cn("size-[1.15rem] shrink-0", active ? "text-sage" : "")}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-3 py-4">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sage/15 font-display text-sm text-sage">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{creatorName}</p>
              {creatorSubtitle && (
                <p className="tabular truncate text-xs text-muted-foreground">
                  {creatorSubtitle}
                </p>
              )}
            </div>
          </div>
          <div className="mt-2">
            <ConnectWallet className="w-full justify-center" initialUser={initialUser} />
          </div>
          <div className="mt-1 flex items-center justify-end">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile top bar — brand + wallet (so auth-only studio isn't dead-ended on phones) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md lg:hidden">
        <Link href="/" aria-label="Findling home" className="shrink-0">
          <FindlingLogo size="1.45rem" wordClassName="text-xl" />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <ConnectWallet initialUser={initialUser} />
          <ThemeToggle className="shrink-0" />
        </div>
      </header>

      {/* Mobile bottom tab bar — all destinations, always reachable, no clipping */}
      <nav
        aria-label="Studio"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {ITEMS.map(({ href, label, icon: Ico }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.6rem] transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Ico
                weight={active ? "fill" : "regular"}
                className={cn("size-5 shrink-0", active ? "text-sage" : "")}
              />
              <span className="leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
