import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

const cx = (...classes: Array<string | undefined | false>) =>
  classes.filter(Boolean).join(" ");

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  const base = "rounded-xl px-4 py-2 text-sm font-semibold transition";
  const styles =
    variant === "primary"
      ? "bg-[#f2c572] text-[#0b0f17] hover:-translate-y-0.5"
      : "border border-white/20 text-white/70 hover:text-white";

  return <button className={cx(base, styles, className)} {...props} />;
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  eyebrow?: string;
  children?: ReactNode;
}

export function Card({ title, eyebrow, children, className, ...props }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl",
        className
      )}
      {...props}
    >
      {eyebrow && (
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">{eyebrow}</p>
      )}
      {title && <h3 className="mt-3 text-lg font-semibold text-white">{title}</h3>}
      {children && <div className="mt-3 text-sm text-white/70">{children}</div>}
    </div>
  );
}
