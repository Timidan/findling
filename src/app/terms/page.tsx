import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Terms of Service | Findling",
  description:
    "Rules for using Findling as a creator, finder, buyer, or agent.",
};

const CONTACT_EMAIL = "akinnusotutemitayodaniel@gmail.com";

export default function TermsPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Legal
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: July 3, 2026
        </p>

        <div className="mt-8 space-y-8 text-sm leading-6 text-muted-foreground">
          <Section title="Using Findling">
            <p>
              Findling helps creators publish video clips, helps finders curate
              clips, and helps people or agents pay to use clips. By using
              Findling, you agree to use it lawfully and only for clips and
              accounts you have the right to use.
            </p>
          </Section>

          <Section title="Creators">
            <ul className="list-disc space-y-2 pl-5">
              <li>Only upload or import videos you own or have permission to publish.</li>
              <li>Set clear titles, descriptions, thumbnails, and prices.</li>
              <li>Do not upload illegal, harmful, stolen, or misleading content.</li>
              <li>You are responsible for rights, claims, and permissions for your clips.</li>
            </ul>
          </Section>

          <Section title="Finders">
            <p>
              Finders earn by making clips easier to discover. Submit honest
              tags, captions, and use-case notes. Do not spam, mislabel clips, or
              claim work you did not do.
            </p>
          </Section>

          <Section title="Buyers and agents">
            <p>
              Use clips only after payment unlocks them. A receipt proves that a
              clip was unlocked and paid for. Keep your receipts and traces for
              your own records.
            </p>
            <p className="mt-3">
              If you use an agent, you are responsible for the keys, spending
              grants, wallet balances, and actions you give that agent.
            </p>
          </Section>

          <Section title="Payments">
            <p>
              Findling uses USDC, x402, Circle Gateway, and Arc testnet payment
              flows. Findling is not a bank. Findling does not custody your
              wallet private keys. You are responsible for wallet security,
              transaction approvals, and agent spending limits.
            </p>
          </Section>

          <Section title="Payouts">
            <p>
              A settled clip use splits the gross payment between creator,
              finder, and platform according to the product rules shown in the
              app. Withdrawals go to the payout wallet you set. Testnet balances
              and testnet behavior may not represent production money movement.
            </p>
          </Section>

          <Section title="Availability and changes">
            <p>
              Findling may change, pause, or remove features. We may update these
              terms as the product changes. Continued use means you accept the
              current terms.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about these terms:{" "}
              <a className="text-foreground underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Also read the{" "}
          <Link className="text-foreground underline-offset-4 hover:underline" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
