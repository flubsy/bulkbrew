"use client";

import Link from "next/link";
import type { PowerRating } from "@/lib/types";

export function PowerMeter({ power, detail = false }: { power: PowerRating; detail?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="px-label !mb-0">Power</span>
        <span className="font-pixel text-[15px] text-cream">
          {power.score}
          <span className="text-muted">/10</span> <span className="ml-2 text-[13px] font-normal text-cream-dim">{power.label}</span>
        </span>
      </div>
      <div className="power-meter mt-2" role="meter" aria-valuenow={power.score} aria-valuemin={1} aria-valuemax={10} aria-label={`Power ${power.score} of 10`}>
        {Array.from({ length: 10 }).map((_, i) => (
          <i key={i} className={i < power.score ? (i >= 8 ? "on hot" : "on") : ""} />
        ))}
      </div>
      {detail && (
        <ul className="mt-3 grid gap-x-8 gap-y-1 text-[16px] text-cream-dim sm:grid-cols-2">
          {power.factors.map((f) => (
            <li key={f.label} className="flex justify-between gap-3">
              <span>
                {f.label} <span className="text-muted">· {f.value}</span>
              </span>
              <span className={f.points > 0 ? "text-orange" : "text-muted"}>{f.points > 0 ? `+${f.points}` : f.points}</span>
            </li>
          ))}
        </ul>
      )}
      {detail && power.caps?.length ? <p className="mt-3 text-[15px] text-gold">{power.caps[0]}</p> : null}
      {detail && (
        <p className="mt-2 text-[14px] text-muted">
          Power is speed and consistency, not the bracket. <Link href="/faq#power" className="text-orange underline underline-offset-4">How is this calculated?</Link>
        </p>
      )}
    </div>
  );
}
