import { redirect } from "next/navigation";

// The old Wanted URL stays as a compatibility route for the Requests tab.
export default function WantedRedirect() {
  redirect("/find?tab=wanted");
}
