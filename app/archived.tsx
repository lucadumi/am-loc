import { useRouter } from "expo-router";

import { WorkInProgress } from "@/components/wip";

export default function ArchivedScreen() {
  const router = useRouter();
  return <WorkInProgress title="Arhivă" onBack={() => router.back()} />;
}
