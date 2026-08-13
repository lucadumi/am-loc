import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * One choice out of a few, as a pill of segments.
 *
 * Two shapes, one component. A segment shows its label, or -- where the
 * options are recognisable without words -- an icon, and the theme setting is
 * the case that wanted the second: a sun and a moon say "light" and "dark"
 * faster than the words do, and in less room.
 *
 * THE LABEL IS REQUIRED EITHER WAY, and that is the point of taking an icon
 * rather than arbitrary children. An icon-only segment is a blank to a screen
 * reader unless somebody remembers to name it, and "somebody remembers" is how
 * a control ends up announcing "buton, buton, buton". Here the label is
 * already what `accessibilityLabel` reads, so an icon hides the word from the
 * eye and from nothing else.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { key: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  const colors = useColors();

  return (
    <View
      /* A group, so a reader announces "1 din 3" as the cursor moves through
         it rather than reading three unrelated buttons. */
      accessibilityRole="radiogroup"
      className={cn("flex-row rounded-full bg-secondary p-1", className)}
    >
      {options.map(({ key, label, icon: Icon }) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => {
              haptics.selection();
              onChange(key);
            }}
            /* `radio` rather than `button`, and `selected` rather than a
               colour. Which segment is chosen is carried by a yellow fill and
               nothing else, so without this the control reads as three
               identical buttons and the answer is invisible. */
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            className={cn(
              "flex-1 items-center justify-center rounded-full py-2.5",
              active && "bg-primary",
            )}
          >
            {Icon ? (
              <Icon
                size={18}
                /* The same pair the label uses. An icon that stayed muted on
                   the yellow fill would be the one part of the control that
                   did not say which segment is chosen. */
                color={active ? colors.primaryForeground : colors.mutedForeground}
                strokeWidth={2.2}
              />
            ) : (
              <Text
                className={cn(
                  "font-semi text-sm",
                  active ? "text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
