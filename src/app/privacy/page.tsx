import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Privacy Policy | Findling",
  description:
    "How Findling handles account, Google and YouTube, upload, agent, and payment data.",
};

const CONTACT_EMAIL = "akinnusotutemitayodaniel@gmail.com";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Legal
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: July 3, 2026
        </p>

        <div className="mt-8 space-y-8 text-sm leading-6 text-muted-foreground">
          <Section title="What Findling does">
            <p>
              Findling is a marketplace for video clips people and agents can use.
              Creators upload or import clips, finders make clips easier to
              discover, and buyers pay in USDC to use clips.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="list-disc space-y-2 pl-5">
              <li>Wallet address, session data, and account settings.</li>
              <li>Creator profile details, payout wallet, clips, thumbnails, titles, descriptions, and prices.</li>
              <li>Searches, curation notes, tags, agent runs, receipts, and payment records.</li>
              <li>Google and YouTube account data when you choose to connect YouTube.</li>
              <li>Basic technical data such as cookies, browser type, device data, and logs needed to run the service.</li>
            </ul>
          </Section>

          <Section title="Google and YouTube">
            <p>
              If you connect Google or YouTube, Findling uses that access to show
              your channel, import videos you choose, and verify that clips belong
              to you. We only use Google data to provide the YouTube import and
              ownership features you request.
            </p>
            <p className="mt-3">
              You can stop using YouTube import at any time. You can also revoke
              Findling access from your Google account permissions page.
            </p>
          </Section>

          <Section title="How we use information">
            <ul className="list-disc space-y-2 pl-5">
              <li>Run accounts, uploads, search, curation, payments, receipts, and withdrawals.</li>
              <li>Show clips and proof pages to users and agents.</li>
              <li>Protect the service from abuse, fraud, spam, and unauthorized access.</li>
              <li>Debug errors, improve product reliability, and respond to support requests.</li>
            </ul>
          </Section>

          <Section title="Payments and wallets">
            <p>
              Findling uses wallet signatures, Circle Gateway, x402, USDC, and Arc
              testnet payment records. Findling does not receive your private key.
              Do not share private keys or seed phrases with Findling or with any
              agent.
            </p>
          </Section>

          <Section title="Sharing">
            <p>
              We do not sell personal data. We share information only when needed
              to run Findling, process payments, store media, comply with law, or
              protect users and the service.
            </p>
          </Section>

          <Section title="Your choices">
            <ul className="list-disc space-y-2 pl-5">
              <li>You can choose not to connect Google or YouTube.</li>
              <li>You can revoke Google access from your Google account.</li>
              <li>You can stop using agent keys or revoke them in Studio.</li>
              <li>You can contact us to ask about account data or deletion.</li>
            </ul>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy:{" "}
              <a className="text-foreground underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Also read the{" "}
          <Link className="text-foreground underline-offset-4 hover:underline" href="/terms">
            Terms of Service
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
