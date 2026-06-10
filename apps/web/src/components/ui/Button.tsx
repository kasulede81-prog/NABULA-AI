import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  loading,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
  const variants = {
    primary:
      "bg-primary text-primary-foreground hover:opacity-90 shadow-glow",
    secondary:
      "bg-secondary border border-border text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-secondary text-muted-foreground hover:text-foreground",
    danger: "bg-destructive hover:opacity-90 text-destructive-foreground",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Loading..." : children}
    </button>
  );
}
