import { useRouter } from "expo-router";

import { WorkInProgress } from "@/components/wip";

export default function NotificationsScreen() {
  const router = useRouter();
  return <WorkInProgress title="Notificări" onBack={() => router.back()} />;
}
