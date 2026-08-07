import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { ActivityIndicator, Pressable } from "react-native";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-full",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
      },
      size: {
        default: "h-14 px-6",
        sm: "h-11 px-4",
      },
      disabled: {
        true: "opacity-50",
        false: "",
      },
    },
    defaultVariants: { variant: "default", size: "default", disabled: false },
  },
);

const labelVariants = cva("font-title text-base", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

type ButtonProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    label?: string;
    rightIcon?: React.ReactNode;
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  label,
  rightIcon,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      className={cn(
        buttonVariants({ variant, size, disabled: !!isDisabled }),
        className,
      )}
      disabled={isDisabled}
      accessibilityRole="button"
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "default" ? palette.primaryForeground : palette.primary
          }
        />
      ) : (
        <>
          {label ? (
            <Text className={cn(labelVariants({ variant }))}>{label}</Text>
          ) : (
            children
          )}
          {rightIcon}
        </>
      )}
    </Pressable>
  );
}
