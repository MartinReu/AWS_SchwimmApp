/**
 * TTButton: zentrales Button-Primitiv im Teletext-Look.
 * Unterstützt Variants/Sizes, Busy-State und polymorphes `as`-Prop für Links oder Buttons.
 */
import { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import clsx from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "info";
type ButtonSize = "md" | "lg";

type TTButtonProps<T extends ElementType = "button"> = {
  as?: T;
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  icon?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children"> & {
  children?: ReactNode;
};

/** Stilisiertes Teletext-Button-Primitiv, optional als Link oder Icon-Button nutzbar. */
export default function TTButton<T extends ElementType = "button">({
  as,
  variant = "primary",
  size = "md",
  busy = false,
  icon,
  className,
  children,
  ...rest
}: TTButtonProps<T>) {
  const Component = (as ?? "button") as ElementType;
  const isDisabled = (rest as { disabled?: boolean }).disabled;
  const enablePixelHover = variant === "primary";
  return (
    <Component
      className={clsx(
        "tt-btn",
        `tt-btn--${variant}`,
        size === "lg" && "tt-btn--lg",
        enablePixelHover && "tt-pixel-hover",
        className
      )}
      data-variant={variant}
      data-size={size}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? (
        <span className="tt-btn__spinner" aria-hidden="true" />
      ) : (
        icon && <span className="tt-btn__icon" aria-hidden="true">{icon}</span>
      )}
      <span className="tt-btn__label">{children}</span>
      {busy && <span className="sr-only">{isDisabled ? "Lädt …" : "In Arbeit …"}</span>}
    </Component>
  );
}
