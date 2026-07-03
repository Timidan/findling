import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getCurrentUserId } from "@/server/auth/current-user";
import { UploadForm } from "@/components/studio/upload-form";
import { StudioAuthGate } from "@/components/studio/studio-auth-gate";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  // uploading writes to the creator's namespace — require login
  const id = await getCurrentUserId();

  if (!id) {
    return <StudioAuthGate message="Sign in with your wallet to upload a clip." />;
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
