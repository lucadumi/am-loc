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
        outline: "border-hairline border-border bg-transparent",
        ghost: "bg-transparent",
        destructive: "bg-destructive",
      },
      size: {
        default: "h-14 px-6",
        sm: "h-11 px-4",
        lg: "h-16 px-8",
        pill: "h-12 px-5",
        icon: "h-12 w-12 rounded-full",
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
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

type ButtonProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    label?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    loading?: boolean;
    textClassName?: string;
  };

export function Button({
  className,
  textClassName,
  variant,
  size,
  label,
  leftIcon,
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
          {leftIcon}
          {label ? (
            <Text className={cn(labelVariants({ variant }), textClassName)}>
              {label}
            </Text>
          ) : (
            children
          )}
          {rightIcon}
        </>
      )}
    </Pressable>
  );
}
