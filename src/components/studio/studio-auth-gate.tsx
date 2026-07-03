import { Wallet } from "@phosphor-icons/react/dist/ssr";
import { ConnectWallet } from "@/components/auth/connect-wallet";

/**
 * The signed-out gate shared by every `/studio/*` page. Unlike the old inline
 * gates (which only told the user to "use the Connect wallet button in the
 * sidebar"), this renders the connect button INLINE so the call-to-action sits
 * with its instruction. `ConnectWallet` refreshes server components on sign-in,
 * so connecting here reveals the page's signed-in state in place.
 */
export function StudioAuthGate({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-24 text-center">
      <Wallet weight="duotone" className="size-9 text-sage" />
      <div className="space-y-1.5">
        <h1 className="font-display text-3xl tracking-tight">Connect your wallet</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {/* initialUser is intentionally null: on the gate the viewer is logged out;
          the button resolves against /api/auth/me and connects in place. */}
      <ConnectWallet initialUser={null} />
    </div>
  );
}
