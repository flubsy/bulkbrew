"use client";

import { useMemo, useState } from "react";
import { scryfallImage } from "@/lib/scryfall";
import type { BuiltDeck, DeckEntry } from "@/lib/types";
import { previewProps, useCardPreview } from "./card-preview";
import { Button, Disclosure } from "./ui";

/**
 * Playtest: draw opening hands with the London mulligan (draw 7, then put one card on the bottom
 * per mulligan; Commander's first mulligan is free), draw a few turns, and see how often the list
 * gives a keepable 7. The odds come from 4,000 simulated hands, not from any AI.
 */

type Card = DeckEntry & { key: number };

const isLand = (c: DeckEntry) => c.role === "land" || /^(Basic )?(Legendary )?(Snow )?Land/.test(c.typeLine);

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Rule-of-thumb keep: 2–5 lands, and something castable early (≤3 mana or ramp). */
function keepable(hand: DeckEntry[]): boolean {
  const lands = hand.filter(isLand).length;
  if (lands < 2 || lands > 5) return false;
  const spells = hand.filter((c) => !isLand(c));
  const early = spells.some((c) => c.cmc <= 3 || c.role === "ramp");
  return lands >= 3 ? early || lands === 5 : spells.some((c) => c.role === "ramp" || c.cmc <= 2);
}

function simulate(library: DeckEntry[], runs = 4000) {
  let keep7 = 0, keepBy6 = 0, lands24 = 0;
  for (let i = 0; i < runs; i++) {
    const a = shuffle(library).slice(0, 7);
    const l = a.filter(isLand).length;
    if (l >= 2 && l <= 4) lands24++;
    if (keepable(a)) { keep7++; keepBy6++; continue; }
    if (keepable(shuffle(library).slice(0, 7))) keepBy6++; // Commander's free mulligan: another 7
  }
  return { keep7: keep7 / runs, keepBy6: keepBy6 / runs, lands24: lands24 / runs };
}

export function SampleHand({ deck }: { deck: BuiltDeck }) {
  const preview = useCardPreview();
  const library = useMemo<Card[]>(() => {
    const out: Card[] = [];
    let k = 0;
    for (const c of deck.cards) for (let i = 0; i < c.quantity; i++) out.push({ ...c, key: k++ });
    return out;
  }, [deck.cards]);
  const isEdh = deck.options.format === "commander" || deck.options.format === "brawl" || deck.options.format === "oathbreaker";
  const [freeMull, setFreeMull] = useState(isEdh);
  const [state, setState] = useState<{ order: Card[]; drawn: number; mulls: number; bottom: number[]; turn: number } | null>(null);
  const [odds, setOdds] = useState<ReturnType<typeof simulate> | null>(null);

  const toBottom = state ? Math.max(0, state.mulls - (freeMull ? 1 : 0)) : 0;
  const choosing = !!state && state.turn === 0 && state.bottom.length < toBottom;
  const hand = state ? state.order.slice(0, state.drawn).filter((c) => !state.bottom.includes(c.key)) : [];
  const lands = hand.filter(isLand).length;

  const deal = (mulls: number) => setState({ order: shuffle(library), drawn: 7, mulls, bottom: [], turn: 0 });
  const draw = () => setState((s) => (s ? { ...s, drawn: s.drawn + 1, turn: s.turn + 1 } : s));
  const pick = (c: Card) => {
    if (!choosing) return;
    setState((s) => (s ? { ...s, bottom: [...s.bottom, c.key] } : s));
  };

  if (library.length < 7) return null;

  return (
    <Disclosure summary="Playtest: opening hands">
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" onClick={() => deal(0)}>{state ? "new hand" : "draw 7"}</Button>
        <Button size="sm" variant="ghost" onClick={() => deal((state?.mulls ?? 0) + 1)} disabled={!state || state.turn > 0 || (state?.mulls ?? 0) >= 6}>mulligan</Button>
        <Button size="sm" variant="ghost" onClick={draw} disabled={!state || choosing || state.drawn >= library.length}>draw a card</Button>
        {isEdh && (
          <label className="ml-2 flex items-center gap-2 text-[15px] text-cream-dim">
            <input type="checkbox" className="h-4 w-4 accent-orange" checked={freeMull} onChange={(e) => setFreeMull(e.target.checked)} />
            first mulligan free
          </label>
        )}
      </div>

      {state && (
        <>
          <p className="mt-3 text-[16px] text-cream-dim">
            {state.mulls ? `Mulligan ${state.mulls} · ` : ""}
            {choosing
              ? <span className="text-orange">Tap {toBottom - state.bottom.length} card{toBottom - state.bottom.length === 1 ? "" : "s"} to put on the bottom.</span>
              : <>{hand.length} cards · {lands} land{lands === 1 ? "" : "s"}{state.turn ? ` · turn ${state.turn} (on the draw: turn ${state.turn + 1})` : ""}{state.turn === 0 && <span className={keepable(hand) ? "text-green" : "text-gold"}> · {keepable(hand) ? "looks keepable" : "probably a mulligan"}</span>}</>}
          </p>
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {hand.map((c) => {
              const img = c.imageSmall ?? (c.scryfallId ? scryfallImage(c.scryfallId, "small") : undefined);
              return (
                <li key={c.key}>
                  <button type="button" {...previewProps(preview, c.imageNormal ?? img, c.name)} onClick={() => (choosing ? pick(c) : preview.open(c.imageNormal ?? img, c.name))} className={`block w-full text-left ${choosing ? "cursor-pointer outline-2 outline-orange hover:opacity-70" : "cursor-zoom-in"}`} aria-label={choosing ? `Put ${c.name} on the bottom` : c.name}>
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={c.name} loading="lazy" width={146} height={204} className="aspect-[146/204] h-auto w-full" style={{ imageRendering: "auto" }} />
                    ) : (
                      <span className="flex aspect-[146/204] items-center justify-center bg-navy-900 p-1 text-center text-[13px]">{c.name}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-4 border-t-4 border-navy-600 pt-3">
        {odds ? (
          <p className="text-[16px] text-cream-dim">
            Out of 4,000 shuffles: <span className="text-cream">{Math.round(odds.lands24 * 100)}%</span> of 7-card hands have 2–4 lands, and{" "}
            <span className="text-cream">{Math.round(odds.keep7 * 100)}%</span> pass a basic keep check (2–5 lands plus an early play).
            {isEdh && <> With the free mulligan, <span className="text-cream">{Math.round(odds.keepBy6 * 100)}%</span> of games start on a keepable 7.</>}
            {odds.keep7 < 0.7 && <span className="block text-gold">That&apos;s on the low side: more lands or cheap ramp would smooth it out.</span>}
          </p>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setOdds(simulate(library))}>check the odds (4,000 hands)</Button>
        )}
      </div>
    </Disclosure>
  );
}
