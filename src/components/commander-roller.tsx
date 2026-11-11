"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { creatureTypes } from "@/lib/builder/classify";
import { detectThemes, suggestCommanders, type CommanderOption } from "@/lib/builder/commanders";
import { db } from "@/lib/db";
import { runBuild, saveForBuilder } from "@/lib/run-build";
import { mapEdhrecTag } from "@/lib/tags";
import { BRACKETS, COLOR_COMBOS, THEMES, comboKey, type BuildOptions, type BuiltDeck, type EdhrecTag, type ThemeId } from "@/lib/types";
import { CardPreviewProvider } from "./card-preview";
import { fetchTags, OBSCURE, pick, useCommanderStats, weighted, type RollMode } from "./commander-picker";
import { DeckView } from "./deck-view";
import { ColorIdentity } from "./mana";
import { DIE, Sprite } from "./sprites";
import { Button, Label, Notice, Panel, Select } from "./ui";

const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.id, t.label])) as Record<string, string>;
const COMBO_ORDER = Object.keys(COLOR_COMBOS);

interface Roll {
  commander: CommanderOption;
  tag?: EdhrecTag;
  themes: ThemeId[];
  tribe?: string;
  why: string;
  allTags: EdhrecTag[];
}

const BASE: BuildOptions = {
  format: "commander", themes: [], includeCards: [], excludeCards: [], referenceDeckIds: [],
  useAI: false, useEdhrec: true, assumeBasics: true, preferCheap: false, mustOwnEverything: true, bracket: 3,
};

export function CommanderRoller() {
  return (
    <CardPreviewProvider>
      <Inner />
    </CardPreviewProvider>
  );
}

function Inner() {
  const router = useRouter();
  const owned = useLiveQuery(() => db.owned.toArray(), []);
  const cards = useMemo(() => (owned ?? []).filter((c) => c.card).map((c) => c.card!), [owned]);
  const all = useMemo(() => suggestCommanders(cards, "commander", [], undefined), [cards]);
  const { stats, loading } = useCommanderStats(all);
  const decksOf = (c: CommanderOption) => stats[c.name.toLowerCase()]?.decks ?? 0;

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of owned ?? []) if (c.card) for (const t of creatureTypes(c.card.typeLine)) m.set(t, (m.get(t) ?? 0) + c.quantity);
    return m;
  }, [owned]);
  const tribes = useMemo(() => [...typeCounts.entries()].filter(([, n]) => n >= 8).map(([t, n]) => ({ t, n })), [typeCounts]);
  const knownTypes = useMemo(() => [...typeCounts.keys()], [typeCounts]);

  const [mode, setMode] = useState<RollMode>("top-tag");
  const [combo, setCombo] = useState("");
  const [skipObscure, setSkipObscure] = useState(true);
  const [bracket, setBracket] = useState<BuildOptions["bracket"]>(3);
  const [rolling, setRolling] = useState(false);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [history, setHistory] = useState<Roll[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [deck, setDeck] = useState<BuiltDeck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const combos = useMemo(() => COMBO_ORDER.filter((k) => all.some((c) => comboKey(c.ci) === k)), [all]);

  function poolFor() {
    let pool = all.filter((c) => !combo || comboKey(c.ci) === combo);
    if (skipObscure && Object.keys(stats).length) {
      const known = pool.filter((c) => decksOf(c) >= OBSCURE);
      if (known.length) pool = known;
    }
    return pool;
  }

  async function tagFor(c: CommanderOption, m: RollMode): Promise<Omit<Roll, "commander">> {
    const info = await fetchTags(c.name);
    if (info.tags.length) {
      const t = m === "top-tag" ? info.tags[0] : weighted(info.tags.slice(0, 10), (x) => x.decks);
      const mapped = mapEdhrecTag(t.slug, knownTypes);
      return { tag: t, themes: mapped.themes, tribe: mapped.tribe, allTags: info.tags, why: `${t.label}: ${t.decks.toLocaleString()} EDHREC decks${m === "top-tag" ? ", its most popular build" : ""}.` };
    }
    const card = cards.find((x) => x.name === c.name)!;
    const det = detectThemes(card);
    const d = det.length ? (m === "top-tag" ? det[0] : pick(det)) : null;
    return { themes: d ? [d.theme] : [], allTags: [], why: d ? `No EDHREC tags, so the theme comes from its text: “${d.quote}”` : "No clear theme: a goodstuff build." };
  }

  async function doRoll(keepCommander = false) {
    setRolling(true);
    setNote(null);
    setDeck(null);
    setError(null);
    try {
      let next: Roll | null = null;
      if (keepCommander && roll) {
        next = { commander: roll.commander, ...(await tagFor(roll.commander, "random-tag")) };
      } else if (mode === "tag-first") {
        let ranked: CommanderOption[] = [];
        let theme: ThemeId = "tokens";
        let tribe: string | undefined;
        for (let i = 0; i < 15 && !ranked.length; i++) {
          const useTribe = tribes.length > 0 && Math.random() < 0.3;
          theme = useTribe ? "tribal" : pick(THEMES.filter((t) => t.id !== "tribal")).id;
          tribe = useTribe ? pick(tribes).t : undefined;
          ranked = suggestCommanders(cards, "commander", [theme], tribe)
            .filter((c) => c.fit >= 6 && (!combo || comboKey(c.ci) === combo) && (!skipObscure || decksOf(c) >= OBSCURE || !Object.keys(stats).length))
            .sort((a, b) => b.fit - a.fit)
            .slice(0, 12);
        }
        if (!ranked.length) { setNote("Couldn't find a theme your commanders clearly support. Try another colour."); return; }
        const c = pick(ranked);
        next = { commander: c, themes: [theme], tribe, allTags: [], why: `Rolled the theme ${tribe ? `${tribe} tribal` : THEME_LABEL[theme]} first. ${c.evidence[0]?.quote ? `It fits: “${c.evidence[0].quote}”` : ""}` };
      } else {
        const pool = poolFor();
        if (!pool.length) { setNote("No commanders in your collection match that colour."); return; }
        const c = pick(pool);
        next = { commander: c, ...(await tagFor(c, mode)) };
      }
      if (next) {
        setRoll(next);
        setHistory((h) => [next!, ...h.filter((x) => x.commander.name !== next!.commander.name)].slice(0, 6));
      }
    } finally {
      setRolling(false);
    }
  }

  function optionsFor(r: Roll): BuildOptions {
    return { ...BASE, bracket, commander: r.commander.name, edhrecTag: r.tag?.slug, themes: r.themes, tribe: r.tribe };
  }

  async function build() {
    if (!roll) return;
    setBuilding(true);
    setError(null);
    try {
      const { deck: d } = await runBuild(optionsFor(roll));
      setDeck(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setBuilding(false);
    }
  }

  if (owned && !cards.length) {
    return <div className="mt-8"><Notice tone="warn">Import your <a href="/collection" className="text-orange underline">collection</a> first: rolls only pick commanders you own.</Notice></div>;
  }

  const stat = roll ? stats[roll.commander.name.toLowerCase()] : undefined;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="grid content-start gap-4">
        <Panel title="Roll settings">
          <Label>What to roll</Label>
          <Select value={mode} onChange={(e) => setMode(e.target.value as RollMode)}>
            <option value="top-tag">A commander + its most popular build</option>
            <option value="random-tag">A commander + a random build of it</option>
            <option value="tag-first">A theme first, then a commander for it</option>
          </Select>
          <div className="mt-3">
            <Label>Colours</Label>
            <Select value={combo} onChange={(e) => setCombo(e.target.value)}>
              <option value="">Any colours</option>
              {combos.map((k) => <option key={k} value={k}>{COLOR_COMBOS[k]}</option>)}
            </Select>
          </div>
          <div className="mt-3">
            <Label>Bracket for the build</Label>
            <Select value={bracket} onChange={(e) => setBracket(Number(e.target.value) as BuildOptions["bracket"])}>
              {BRACKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </div>
          <label className="mt-3 flex items-center gap-3 text-[17px]">
            <input type="checkbox" className="h-5 w-5 accent-orange" checked={skipObscure} onChange={(e) => setSkipObscure(e.target.checked)} />
            Skip niche commanders (under {OBSCURE} EDHREC decks)
          </label>
          <p className="mt-2 text-[14px] text-muted">{loading ? "Loading EDHREC popularity…" : `${all.length} commanders in your collection to roll from.`}</p>
        </Panel>

        <button type="button" onClick={() => doRoll()} disabled={rolling || !all.length} className="px-btn flex items-center justify-center gap-3 !py-5 !text-[20px]">
          <Sprite grid={DIE} scale={3} className={rolling ? "animate-spin" : ""} /> {rolling ? "Rolling…" : roll ? "Roll again" : "Roll"}
        </button>
        {note && <Notice tone="warn">{note}</Notice>}

        {history.length > 1 && (
          <Panel title="Recent rolls">
            <ul className="grid gap-1">
              {history.slice(1).map((h) => (
                <li key={h.commander.name}>
                  <button type="button" className="w-full px-2 py-1 text-left text-[16px] hover:bg-navy-600" onClick={() => { setRoll(h); setDeck(null); }}>
                    {h.commander.name} <span className="text-muted">· {h.tag?.label ?? (h.tribe ? `${h.tribe} tribal` : h.themes.map((t) => THEME_LABEL[t]).join(", ") || "goodstuff")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div className="grid content-start gap-5">
        {!roll ? (
          <Panel title="Ready when you are">
            <p className="text-[19px] text-cream-dim">Roll a random commander from your collection, along with the way most people build it on EDHREC. Or roll a theme first and let BulkBrew find a commander you own that fits. Then build it in one click.</p>
          </Panel>
        ) : (
          <Panel tone="orange" title="You rolled">
            <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
              {roll.commander.imageNormal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={roll.commander.imageNormal} alt={roll.commander.name} width={220} height={307} className="px-border w-full max-w-[220px]" style={{ imageRendering: "auto" }} />
              ) : <div className="px-border aspect-[5/7] w-full max-w-[220px] bg-navy-900" />}
              <div>
                <div className="font-pixel text-[22px] text-cream">{roll.commander.name}</div>
                <div className="mt-2 flex items-center gap-2 text-[16px] text-muted">
                  <ColorIdentity ci={roll.commander.ci} size={16} label={roll.commander.combo} /> {roll.commander.combo}
                  {stat && <span>· {stat.decks.toLocaleString()} EDHREC decks</span>}
                </div>
                <div className="mt-4">
                  <div className="px-label">Build</div>
                  <div className="font-pixel text-[18px] text-orange">{roll.tag?.label ?? (roll.tribe ? `${roll.tribe} tribal` : roll.themes.map((t) => THEME_LABEL[t]).join(", ") || "Goodstuff")}</div>
                  <p className="mt-1 text-[16px] text-cream-dim">{roll.why}</p>
                </div>
                {roll.allTags.length > 1 && (
                  <div className="mt-3">
                    <div className="px-label">Other popular builds</div>
                    <div className="flex flex-wrap gap-1">
                      {roll.allTags.slice(0, 8).map((t) => (
                        <button key={t.slug} type="button" className="px-chip px-border" aria-pressed={roll.tag?.slug === t.slug} onClick={() => { const m = mapEdhrecTag(t.slug, knownTypes); setRoll({ ...roll, tag: t, themes: m.themes, tribe: m.tribe, why: `${t.label}: ${t.decks.toLocaleString()} EDHREC decks.` }); setDeck(null); }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button onClick={build} disabled={building}>{building ? "Building…" : "Build this deck"}</Button>
                  <Button variant="ghost" onClick={() => doRoll(true)} disabled={rolling}>Re-roll the build</Button>
                  <Button variant="ghost" onClick={() => { saveForBuilder(optionsFor(roll)); router.push("/build"); }}>Tweak in builder</Button>
                </div>
                {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
              </div>
            </div>
          </Panel>
        )}
        {deck && <DeckView deck={deck} onChange={setDeck} />}
      </div>
    </div>
  );
}
