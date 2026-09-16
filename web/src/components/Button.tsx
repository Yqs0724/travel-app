import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Props = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
  }
>;

const styles = {
  primary: "bg-accent-dark text-white",
  secondary: "border border-accent-dark text-accent-dark bg-transparent",
  ghost: "text-accent-dark bg-transparent",
  danger: "text-danger bg-transparent",
};

export function Button({ variant = "primary", className = "", children, ...rest }: Props) {
  return (
    <button
      className={`inline-flex h-11 min-h-[44px] items-center justify-center rounded-btn px-4 text-[15px] font-medium disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
