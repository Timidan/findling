import { redirect } from "next/navigation";

// The Wanted board is now the "Wanted" tab of the unified discovery hub.
export default function WantedRedirect() {
  redirect("/find?tab=wanted");
}
