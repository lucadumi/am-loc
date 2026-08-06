import { Pressable } from "react-native";

import { cn } from "@/lib/utils";

export function FloatingControl({
  children,
  onPress,
  className,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "h-12 w-12 items-center justify-center rounded-full border-hairline border-border bg-card",
        className,
      )}
    >
      {children}
    </Pressable>
  );
}
