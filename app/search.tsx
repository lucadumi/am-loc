import { useRouter } from "expo-router";

import { WorkInProgress } from "@/components/wip";

export default function SearchScreen() {
  const router = useRouter();
  return <WorkInProgress title="Căutare" onBack={() => router.back()} />;
}
