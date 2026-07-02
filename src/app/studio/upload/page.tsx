import Link from "next/link";
import { ArrowLeft, Wallet } from "@phosphor-icons/react/dist/ssr";
import { getCurrentUserId } from "@/server/auth/current-user";
import { UploadForm } from "@/components/studio/upload-form";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  // uploading writes to the creator's namespace — require login
  const id = await getCurrentUserId();

  if (!id) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-24 text-center">
        <Wallet weight="duotone" className="size-9 text-sage" />
        <h1 className="font-display text-3xl tracking-tight">Connect your wallet</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your wallet to upload a clip.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-10">
      <Link
        href="/studio/clips"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft weight="bold" className="size-3.5" />
        Clips
      </Link>
      <div className="mt-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">New clip</p>
        <h1 className="mt-2 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
          Upload a clip
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Add a clip you own or are allowed to publish. You choose the price
          before it goes live.
        </p>
      </div>
      <div className="mt-8">
        <UploadForm />
      </div>
    </div>
  );
}
