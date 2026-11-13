"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/* Small 8-bit UI kit. Every control sits on the 4px grid and uses the notched px-border. */

export function Panel({ children, className = "", tone = "default", title, aside }: { children: ReactNode; className?: string; tone?: "default" | "orange" | "gold"; title?: string; aside?: ReactNode }) {
  const toneClass = tone === "orange" ? "px-border-orange" : tone === "gold" ? "px-border-gold" : "";
  return (
    <section className={`px-border px-panel ${toneClass} ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-4 border-b-4 border-navy-600 px-4 py-3">
          <h2 className="font-pixel text-[14px] text-orange">{title}</h2>
          {aside}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({ children, variant = "primary", size, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost"; size?: "sm" }) {
  return (
    <button className={`px-btn ${variant === "ghost" ? "px-btn-ghost" : ""} ${size === "sm" ? "px-btn-sm" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`px-input px-border ${className}`} {...rest} />;
}

// App-drawn dropdown with the <select> API (see select.tsx).
export { Select } from "./select";

export function TextArea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`px-input px-border ${className}`} {...rest} />;
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="px-label">
      {children}
      {hint && <span className="ml-2 font-body text-[14px] normal-case text-cream-dim">{hint}</span>}
    </span>
  );
}

export function Chip({ pressed, onClick, children, title }: { pressed: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className="px-chip px-border" aria-pressed={pressed} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      {label && (
        <div className="mb-2 flex justify-between text-[16px] text-cream-dim">
          <span>{label}</span>
          <span>{value}/{max}</span>
        </div>
      )}
      <div className="px-progress px-border" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="px-border px-panel p-4">
      <div className="px-label mb-1">{label}</div>
      <div className="font-pixel text-[22px] leading-none text-cream">{value}</div>
      {sub && <div className="mt-2 text-[15px] text-muted">{sub}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const color = tone === "error" ? "px-border-orange text-orange" : tone === "warn" ? "px-border-gold text-gold" : tone === "ok" ? "text-green" : "text-cream-dim";
  return <div className={`px-border bg-navy-900 px-4 py-3 text-[17px] ${color}`}>{children}</div>;
}

export { ManaCost } from "./mana";

/** Collapsible section with a pixel disclosure arrow. */
export function Disclosure({ summary, children, defaultOpen = false, aside }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  return (
    <details className="group px-border px-panel" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="font-pixel text-[11px] text-orange">
          <span className="mr-2 inline-block text-cream-dim transition-none group-open:rotate-90">▶</span>
          {summary}
        </span>
        {aside}
      </summary>
      <div className="border-t-4 border-navy-600 p-4">{children}</div>
    </details>
  );
}

export const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
