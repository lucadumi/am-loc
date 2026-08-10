import { useRouter } from "expo-router";

import { WorkInProgress } from "@/components/wip";

/**
 * The spaces this driver has listed.
 *
 * A stub, like the screen that creates them: #18 builds both. It exists now
 * because the profile page needs somewhere to send somebody who asks what they
 * have listed, and a row that leads nowhere is worse than one that leads to a
 * page saying "not yet".
 *
 * Nothing here asks for an account. An anonymous driver simply has no
 * listings, and turning an empty list into a demand for an email would be
 * asking for a signature to read a blank page. Whether listing itself needs
 * one is #17's and #18's question, answered where the listing is made.
 */
export default function MySpotsScreen() {
  const router = useRouter();
  return (
    <WorkInProgress title="Locurile mele" onBack={() => router.back()} />
  );
}
