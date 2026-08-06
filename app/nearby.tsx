import { useRouter } from "expo-router";

import { WorkInProgress } from "@/components/wip";

export default function NearbyScreen() {
  const router = useRouter();
  return <WorkInProgress title="Parcări lângă tine" onBack={() => router.back()} />;
}
