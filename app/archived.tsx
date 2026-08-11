import { useRouter } from "expo-router";

import { WorkInProgress } from "@/components/wip";

export default function ArchivedScreen() {
  const router = useRouter();
  /* "Salvate", not "Arhivă": that is what the button on the home header has
     always been called and what the profile row calls it now. One thing with
     two names is one name too many, and the screen was the odd one out. */
  return <WorkInProgress title="Salvate" onBack={() => router.back()} />;
}
