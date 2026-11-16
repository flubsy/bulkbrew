"use client";

import { quotas } from "@/lib/builder/quotas";
import { COMPOSITION_KEYS, FORMATS, type BuildOptions, type CompositionKey } from "@/lib/types";
import { Button, Disclosure } from "./ui";

/**
 * Deck makeup: a slider per part of the deck (lands, ramp, draw…). Each starts on "auto", which
 * uses the builder's own target for this format and theme (the land count follows EDHREC's average
 * deck when there's a commander). Moving a slider fixes that number; "auto" hands it back.
 */
const LABEL: Record<CompositionKey, string> = {
  land: "Lands", ramp: "Ramp", draw: "Card draw", removal: "Removal", wipe: "Board wipes", counter: "Counterspells",
  protection: "Protection", tutor: "Tutors", recursion: "Recursion", finisher: "Finishers",
};
const RANGE: Record<CompositionKey, [number, number]> = {
  land: [28, 42], ramp: [0, 18], draw: [0, 18], removal: [0, 16], wipe: [0, 6], counter: [0, 10], protection: [0, 8], tutor: [0, 8], recursion: [0, 6], finisher: [0, 6],
};

export function CompositionSliders({ opts, setOpts }: { opts: BuildOptions; setOpts: (f: (o: BuildOptions) => BuildOptions) => void }) {
  const auto = quotas(opts.format, opts.themes) as Partial<Record<CompositionKey, number>> & { land: number };
  const comp = opts.composition ?? {};
  const set = (k: CompositionKey, v: number | undefined) =>
    setOpts((o) => {
      const next = { ...(o.composition ?? {}) };
      if (v === undefined) delete next[k];
      else next[k] = v;
      return { ...o, composition: Object.keys(next).length ? next : undefined };
    });
  const custom = Object.keys(comp).length;
  const size = FORMATS.find((f) => f.id === opts.format)?.size ?? 60;
  const lands = comp.land ?? auto.land;
  const roleSlots = COMPOSITION_KEYS.filter((k) => k !== "land").reduce((s, k) => s + (comp[k] ?? auto[k] ?? 0), 0);
  const spells = size - lands - (size === 100 ? 1 : 0);

  return (
    <Disclosure summary="Deck makeup" aside={<span className="text-[15px] text-muted">{custom ? `${custom} set by you` : "all automatic"}</span>}>
      <p className="mb-3 text-[15px] text-cream-dim">
        How many of each the builder aims for. <span className="text-cream">Auto</span> uses its own target for this format and theme; with a commander, the land count follows EDHREC&apos;s average deck. Drag a slider to fix a number.
      </p>
      <ul className="grid gap-3">
        {COMPOSITION_KEYS.map((k) => {
          const isAuto = comp[k] === undefined;
          const value = comp[k] ?? auto[k] ?? 0;
          const [min, max] = RANGE[k];
          return (
            <li key={k}>
              <div className="flex items-baseline justify-between gap-2 text-[16px]">
                <label htmlFor={`comp-${k}`} className="text-cream">{LABEL[k]}</label>
                <span className="flex items-center gap-2">
                  <span className={isAuto ? "text-muted" : "text-orange"}>{value}{isAuto && k === "land" ? " (or EDHREC's)" : ""}</span>
                  <button type="button" className="px-chip px-border !px-2 !py-[2px] !text-[11px]" aria-pressed={isAuto} onClick={() => set(k, isAuto ? value : undefined)} title={isAuto ? "Fix this number" : "Back to automatic"}>auto</button>
                </span>
              </div>
              <input id={`comp-${k}`} type="range" min={min} max={max} value={value} onChange={(e) => set(k, Number(e.target.value))} className={`w-full accent-orange ${isAuto ? "opacity-50" : ""}`} aria-valuetext={`${value}${isAuto ? ", automatic" : ""}`} />
            </li>
          );
        })}
      </ul>
      <p className={`mt-3 text-[15px] ${roleSlots > spells ? "text-gold" : "text-muted"}`}>
        {roleSlots} of {spells} non-land slots go to these roles; the rest are creatures and theme cards.{roleSlots > spells ? " That's more than fit: the builder fills roles in order until the deck is full." : ""}
      </p>
      {custom > 0 && <div className="mt-2"><Button size="sm" variant="ghost" onClick={() => setOpts((o) => ({ ...o, composition: undefined }))}>all back to auto</Button></div>}
    </Disclosure>
  );
}
