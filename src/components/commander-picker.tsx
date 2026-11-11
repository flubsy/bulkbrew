"use client";

import { useEffect, useMemo, useState } from "react";
import { detectThemes, suggestCommanders, type CommanderOption } from "@/lib/builder/commanders";
import { mapEdhrecTag } from "@/lib/tags";
import { COLOR_COMBOS, THEMES, comboKey, type BuildOptions, type CardData, type EdhrecTag, type ThemeId } from "@/lib/types";
import { useCardPreview } from "./card-preview";
import { ColorIdentity } from "./mana";
import { DIE, Sprite } from "./sprites";
import { Button, Input, Label, Notice, Panel, Select } from "./ui";

type Stat = { decks: number; colorRank: number; trend: number | null };
type Sort = "fit" | "popular" | "trending" | "name";
type RollMode = "top-tag" | "random-tag" | "tag-first";

const COMBO_ORDER = Object.keys(COLOR_COMBOS);
const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.id, t.label])) as Record<string, string>;
const OBSCURE = 300; // decks on EDHREC below which a commander counts as niche

function fmtDecks(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

/** Popularity for the user's commanders from EDHREC (cached server-side for a day). */
function useCommanderStats(list: CommanderOption[]) {
  const [data, setData] = useState<{ stats: Record<string, Stat>; trending: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(false);
  const key = useMemo(() => list.map((c) => c.name).sort().join("|"), [list]);
  useEffect(() => {
    if (!list.length) return;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/edhrec/commanders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commanders: list.map((c) => ({ name: c.name, ci: c.ci })) }),
        });
        if (res.ok && alive) setData(await res.json());
      } catch { /* popularity is optional */ }
      if (alive) setLoading(false);
    }, 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { stats: data?.stats ?? {}, trending: data?.trending ?? {}, loading };
}

async function fetchTags(name: string, partner?: string): Promise<{ decks: number | null; rank: number | null; tags: EdhrecTag[] }> {
  try {
    const res = await fetch(`/api/edhrec/commander?name=${encodeURIComponent(name)}${partner ? `&partner=${encodeURIComponent(partner)}` : ""}`);
    if (res.ok) return await res.json();
  } catch { /* ignore */ }
  return { decks: null, rank: null, tags: [] };
}

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}
function weighted<T>(xs: T[], w: (x: T) => number): T {
  const total = xs.reduce((s, x) => s + w(x), 0);
  let r = Math.random() * total;
  for (const x of xs) { r -= w(x); if (r <= 0) return x; }
  return xs[xs.length - 1];
}

export function CommanderPicker({
  cards,
  opts,
  setOpts,
  knownTypes,
  tribes,
  onRolledBuild,
}: {
  cards: CardData[];
  opts: BuildOptions;
  setOpts: (fn: (o: BuildOptions) => BuildOptions) => void;
  knownTypes: string[];
  tribes: { t: string; n: number }[];
  onRolledBuild: (o: BuildOptions) => void;
}) {
  const preview = useCardPreview();
  const [q, setQ] = useState("");
  const [combo, setCombo] = useState("");
  const [sort, setSort] = useState<Sort>("fit");
  const [tags, setTags] = useState<{ decks: number | null; rank: number | null; tags: EdhrecTag[] } | null>(null);
  const [tagsFor, setTagsFor] = useState<string | null>(null);
  const [rollMode, setRollMode] = useState<RollMode>("top-tag");
  const [skipObscure, setSkipObscure] = useState(true);
  const [buildNow, setBuildNow] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rollNote, setRollNote] = useState<string | null>(null);

  const all = useMemo(() => suggestCommanders(cards, opts.format, opts.themes, opts.tribe), [cards, opts.format, opts.themes, opts.tribe]);
  const { stats, trending, loading } = useCommanderStats(useMemo(() => suggestCommanders(cards, opts.format, [], undefined), [cards, opts.format]));
  const decksOf = (c: CommanderOption) => stats[c.name.toLowerCase()]?.decks ?? 0;

  const combos = useMemo(() => {
    const s = new Set(all.map((c) => comboKey(c.ci)));
    return COMBO_ORDER.filter((k) => s.has(k));
  }, [all]);

  const hasThemes = opts.themes.length > 0 && !(opts.themes.length === 1 && opts.themes[0] === "tribal" && !opts.tribe);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let l = all.filter((c) => (!needle || c.name.toLowerCase().includes(needle) || c.typeLine.toLowerCase().includes(needle) || c.combo.toLowerCase().includes(needle)) && (!combo || comboKey(c.ci) === combo));
    const byDecks = (a: CommanderOption, b: CommanderOption) => decksOf(b) - decksOf(a);
    if (sort === "name") l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "popular") l = [...l].sort(byDecks);
    else if (sort === "trending") {
      // EDHREC's trend z-score: how far above its usual rate a commander is being built right now.
      const z = (c: CommanderOption) => (decksOf(c) >= 200 ? stats[c.name.toLowerCase()]?.trend ?? -99 : -99);
      l = [...l].sort((a, b) => z(b) - z(a));
    } else l = [...l].sort((a, b) => (hasThemes ? b.fit - a.fit : 0) || byDecks(a, b) || a.name.localeCompare(b.name));
    return l.slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, q, combo, sort, stats, trending, hasThemes]);

  const selected = all.find((c) => c.name === opts.commander);
  const selectedCard = cards.find((c) => c.name === opts.commander);

  // EDHREC tags for the selected commander.
  useEffect(() => {
    if (!opts.commander || tagsFor === `${opts.commander}|${opts.partner ?? ""}`) return;
    let alive = true;
    const key = `${opts.commander}|${opts.partner ?? ""}`;
    fetchTags(opts.commander, opts.partner).then((t) => { if (alive) { setTags(t); setTagsFor(key); } });
    return () => { alive = false; };
  }, [opts.commander, opts.partner, tagsFor]);

  function chooseTag(t: EdhrecTag | null) {
    setOpts((o) => {
      if (!t || o.edhrecTag === t.slug) return { ...o, edhrecTag: undefined };
      const m = mapEdhrecTag(t.slug, knownTypes);
      const themes = [...new Set([...o.themes.filter((x) => x !== "tribal"), ...m.themes])] as ThemeId[];
      return { ...o, edhrecTag: t.slug, themes, tribe: m.tribe ?? (m.themes.includes("tribal") ? o.tribe : undefined) };
    });
  }

  async function roll() {
    setRolling(true);
    setRollNote(null);
    try {
      let next: BuildOptions | null = null;
      if (rollMode === "tag-first") {
        // Random theme (or tribe), then a commander that genuinely fits it. Re-roll themes nobody supports.
        let theme: ThemeId = "tokens";
        let tribe: string | undefined;
        let ranked: CommanderOption[] = [];
        for (let attempt = 0; attempt < 15 && !ranked.length; attempt++) {
          const useTribe = tribes.length > 0 && Math.random() < 0.3;
          theme = useTribe ? "tribal" : pick(THEMES.filter((t) => t.id !== "tribal")).id;
          tribe = useTribe ? pick(tribes.filter((t) => t.n >= 8).length ? tribes.filter((t) => t.n >= 8) : tribes).t : undefined;
          ranked = suggestCommanders(cards, opts.format, [theme], tribe)
            .filter((c) => c.fit >= 6 && (!combo || comboKey(c.ci) === combo) && (!skipObscure || decksOf(c) >= OBSCURE || !Object.keys(stats).length))
            .sort((a, b) => b.fit - a.fit)
            .slice(0, 12);
        }
        if (!ranked.length) { setRollNote("Couldn't find a theme your commanders clearly support. Try clearing the colour filter."); return; }
        const c = pick(ranked);
        next = { ...opts, commander: c.name, partner: undefined, themes: [theme], tribe, edhrecTag: undefined };
        setRollNote(`Rolled the theme ${tribe ? `${tribe} tribal` : THEME_LABEL[theme]}, then ${c.name} (${c.evidence[0]?.label ?? "fits"}).`);
      } else {
        let pool = all.filter((c) => !combo || comboKey(c.ci) === combo);
        if (skipObscure && Object.keys(stats).length) {
          const known = pool.filter((c) => decksOf(c) >= OBSCURE);
          if (known.length) pool = known;
        }
        if (!pool.length) { setRollNote("No commanders match that colour filter."); return; }
        const c = pick(pool);
        const info = await fetchTags(c.name);
        const card = cards.find((x) => x.name === c.name)!;
        if (info.tags.length) {
          const t = rollMode === "top-tag" ? info.tags[0] : weighted(info.tags.slice(0, 10), (x) => x.decks);
          const m = mapEdhrecTag(t.slug, knownTypes);
          next = { ...opts, commander: c.name, partner: undefined, edhrecTag: t.slug, themes: m.themes, tribe: m.tribe };
          setRollNote(`Rolled ${c.name}. Tag: ${t.label} (${t.decks.toLocaleString()} EDHREC decks${rollMode === "top-tag" ? ", its most popular build" : ""}).`);
        } else {
          const det = detectThemes(card);
          const d = det.length ? (rollMode === "top-tag" ? det[0] : pick(det)) : null;
          next = { ...opts, commander: c.name, partner: undefined, edhrecTag: undefined, themes: d ? [d.theme] : [], tribe: undefined };
          setRollNote(`Rolled ${c.name}. EDHREC has no tags for it, so the theme comes from its text: ${d ? `${THEME_LABEL[d.theme]} (“${d.quote}”)` : "none found — a goodstuff build"}.`);
        }
      }
      if (next) {
        const n = next;
        setOpts(() => n);
        if (buildNow) onRolledBuild(n);
      }
    } finally {
      setRolling(false);
    }
  }

  return (
    <>
      <Panel title="Commander" aside={<span className="text-[15px] text-muted">{all.length} legal in your collection</span>}>
        {selected ? (
          <SelectedCommander
            c={selected}
            card={selectedCard}
            stat={stats[selected.name.toLowerCase()]}
            tags={tagsFor?.startsWith(selected.name) ? tags : null}
            activeTag={opts.edhrecTag}
            onTag={chooseTag}
            onChange={() => setOpts((o) => ({ ...o, commander: undefined, partner: undefined, edhrecTag: undefined }))}
            preview={preview}
          />
        ) : (
          <>
            {hasThemes && sort === "fit" && (
              <p className="mb-3 text-[16px] text-cream-dim">
                Ranked by how directly each commander&apos;s rules text supports <span className="text-orange">{opts.themes.map((t) => (t === "tribal" ? `${opts.tribe ?? ""} tribal` : THEME_LABEL[t])).join(", ")}</span>. Hover a tag to see the exact wording.
              </p>
            )}
            <Input placeholder="Search name, type, guild…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search commanders" />
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Select value={combo} onChange={(e) => setCombo(e.target.value)} aria-label="Colour identity">
                <option value="">All colours</option>
                {combos.map((k) => (
                  <option key={k} value={k}>{COLOR_COMBOS[k]}</option>
                ))}
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort commanders">
                <option value="fit">{hasThemes ? "Best fit for theme" : "Best fit (most played)"}</option>
                <option value="popular">Most played on EDHREC</option>
                <option value="trending">Rising right now</option>
                <option value="name">A–Z</option>
              </Select>
            </div>
            <p className="mt-2 text-[14px] text-muted">
              {loading ? "Loading EDHREC deck counts…" : "Deck counts: decks on EDHREC over the past two years. Rising: being built well above its usual rate. “#N this week”: EDHREC's 100 most-built commanders this week."}
            </p>
            <ul className="mt-2 max-h-96 overflow-y-auto">
              {list.map((c) => (
                <CommanderRow
                  key={c.name}
                  c={c}
                  stat={stats[c.name.toLowerCase()]}
                  trend={trending[c.name.toLowerCase()]}
                  showEvidence={hasThemes}
                  onPick={() => { setOpts((o) => ({ ...o, commander: c.name, partner: undefined, edhrecTag: undefined })); setQ(""); }}
                  preview={preview}
                />
              ))}
              {!list.length && <li className="px-2 py-2 text-[16px] text-muted">No match.</li>}
            </ul>
          </>
        )}
      </Panel>

      <Panel title="Roll a commander" aside={<Sprite grid={DIE} scale={2} />}>
        <Label>Mode</Label>
        <Select value={rollMode} onChange={(e) => setRollMode(e.target.value as RollMode)}>
          <option value="top-tag">Random commander + its most popular build</option>
          <option value="random-tag">Random commander + a random build of it</option>
          <option value="tag-first">Random theme + a commander that fits it</option>
        </Select>
        <label className="mt-3 flex items-center gap-3 text-[17px]">
          <input type="checkbox" className="h-5 w-5 accent-orange" checked={skipObscure} onChange={(e) => setSkipObscure(e.target.checked)} />
          Skip niche commanders (under {OBSCURE} EDHREC decks)
        </label>
        <label className="mt-2 flex items-center gap-3 text-[17px]">
          <input type="checkbox" className="h-5 w-5 accent-orange" checked={buildNow} onChange={(e) => setBuildNow(e.target.checked)} />
          Build the deck straight away
        </label>
        <p className="mt-2 text-[14px] text-muted">Uses the colour filter above if one is set. Builds are always rules-based; no AI needed.</p>
        <div className="mt-3 flex gap-2">
          <Button onClick={roll} disabled={rolling || !all.length}>{rolling ? "Rolling…" : "Roll"}</Button>
        </div>
        {rollNote && <div className="mt-3"><Notice tone="ok">{rollNote}</Notice></div>}
      </Panel>
    </>
  );
}

function CommanderRow({ c, stat, trend, showEvidence, onPick, preview }: { c: CommanderOption; stat?: Stat; trend?: number; showEvidence: boolean; onPick: () => void; preview: ReturnType<typeof useCardPreview> }) {
  return (
    <li>
      <button type="button" className="w-full px-2 py-2 text-left hover:bg-navy-600" onMouseEnter={(e) => preview.show(c.imageNormal, c.name, e)} onMouseLeave={preview.hide} onClick={() => { preview.hide(); onPick(); }}>
        <span className="flex items-center justify-between gap-3">
          <span className="truncate text-[18px]">{c.name}</span>
          <ColorIdentity ci={c.ci} size={14} label={c.combo} />
        </span>
        <span className="mt-[2px] flex flex-wrap items-center gap-x-3 text-[14px] text-muted">
          <span>{c.combo}</span>
          {stat ? <span className="text-cream-dim">{fmtDecks(stat.decks)} decks · #{stat.colorRank} {c.combo.toLowerCase()}</span> : <span>niche on EDHREC</span>}
          {stat?.trend != null && stat.trend >= 1 && stat.decks >= 200 && <span className="font-pixel text-[11px] text-green">▲ rising</span>}
          {trend && <span className="font-pixel text-[11px] text-gold">#{trend} this week</span>}
        </span>
        {showEvidence && c.evidence.length > 0 && (
          <span className="mt-1 block">
            {c.evidence.slice(0, 2).map((e, i) => (
              <span key={i} className="mt-1 block text-[14px] text-cream-dim">
                <span className="font-pixel mr-2 text-[11px] text-orange">{e.label}</span>
                {e.quote && <span className="italic text-muted">“{e.quote}”</span>}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  );
}

function SelectedCommander({
  c, card, stat, tags, activeTag, onTag, onChange, preview,
}: {
  c: CommanderOption;
  card?: CardData;
  stat?: Stat;
  tags: { decks: number | null; rank: number | null; tags: EdhrecTag[] } | null;
  activeTag?: string;
  onTag: (t: EdhrecTag | null) => void;
  onChange: () => void;
  preview: ReturnType<typeof useCardPreview>;
}) {
  const detected = card ? detectThemes(card) : [];
  return (
    <div>
      <div className="px-border flex items-center justify-between gap-3 bg-navy-900 px-3 py-2">
        <button type="button" className="text-left" onMouseEnter={(e) => preview.show(c.imageNormal, c.name, e)} onMouseLeave={preview.hide} onClick={() => preview.open(c.imageNormal, c.name)}>
          <div className="text-[20px]">{c.name}</div>
          <div className="mt-1 flex items-center gap-2 text-[15px] text-muted">
            <ColorIdentity ci={c.ci} size={14} label={c.combo} /> {c.combo} · {c.typeLine.split("—")[1]?.trim()}
          </div>
          <div className="mt-1 text-[15px] text-cream-dim">
            {tags?.decks ? `${tags.decks.toLocaleString()} decks on EDHREC${tags.rank ? ` · #${tags.rank.toLocaleString()} overall` : ""}` : stat ? `${stat.decks.toLocaleString()} decks on EDHREC` : "Not much EDHREC data"}
          </div>
        </button>
        <Button size="sm" variant="ghost" onClick={onChange}>change</Button>
      </div>

      <div className="mt-4">
        <Label hint="what EDHREC players tag their decks with — pick one to build that version">Popular builds</Label>
        {!tags && <p className="text-[15px] text-muted">Loading…</p>}
        {tags && !tags.tags.length && <p className="text-[15px] text-muted">EDHREC has no tags for this commander.</p>}
        <div className="flex flex-wrap gap-1">
          {tags?.tags.slice(0, 12).map((t) => (
            <button key={t.slug} type="button" className="px-chip px-border" aria-pressed={activeTag === t.slug} onClick={() => onTag(t)} title={`${t.decks.toLocaleString()} decks tagged ${t.label}`}>
              {t.label} <span className="text-[11px] opacity-70">{fmtDecks(t.decks)}</span>
            </button>
          ))}
        </div>
        {activeTag && (
          <p className="mt-2 text-[15px] text-cream-dim">
            Building the <span className="text-orange">{tags?.tags.find((t) => t.slug === activeTag)?.label ?? activeTag}</span> version: card choices are weighted by what decks with this tag play.{" "}
            <button type="button" className="text-orange underline" onClick={() => onTag(null)}>clear</button>
          </p>
        )}
      </div>

      {detected.length > 0 && (
        <div className="mt-4">
          <Label hint="matched in its rules text">What the card itself asks for</Label>
          <ul className="grid gap-1">
            {detected.slice(0, 5).map((d) => (
              <li key={d.theme} className="text-[15px] text-cream-dim">
                <span className="font-pixel mr-2 text-[11px] text-orange">{THEME_LABEL[d.theme]}</span>
                <span className="italic text-muted">“{d.quote}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
