import { useRouter } from "expo-router";

import { WorkInProgress } from "@/components/wip";

export default function AddSpotScreen() {
  const router = useRouter();
  return (
    <WorkInProgress title="Adaugă un loc de parcare" onBack={() => router.back()} />
  );
}
