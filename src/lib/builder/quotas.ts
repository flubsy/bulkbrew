import { FORMATS, type BuildOptions, type DeckProfile, type Role } from "../types";

/**
 * Deck composition targets (lands, ramp, draw, removal…). No heavy imports, so the Build page can
 * show the same "auto" numbers the builder uses next to its sliders.
 */

export function formatMeta(f: BuildOptions["format"]) {
  return FORMATS.find((x) => x.id === f)!;
}

/**
 * Role quotas per format. Commander numbers are for 99 cards. When EDHREC's average deck for the
 * commander is known (`profile`), its land count replaces the fixed one (it already reflects the tag).
 */
export function quotas(format: BuildOptions["format"], themes: BuildOptions["themes"], profile?: DeckProfile, overrides?: BuildOptions["composition"]): Partial<Record<Role, number>> & { land: number } {
  const q = baseQuotas(format, themes, profile);
  // Your slider settings win over the defaults (and over EDHREC's land count).
  for (const [k, v] of Object.entries(overrides ?? {})) if (typeof v === "number") (q as Record<string, number>)[k] = v;
  return q;
}

function baseQuotas(format: BuildOptions["format"], themes: BuildOptions["themes"], profile?: DeckProfile): Partial<Record<Role, number>> & { land: number } {
  const singleton = formatMeta(format).singleton;
  if (singleton && formatMeta(format).size === 100) {
    const q: Partial<Record<Role, number>> & { land: number } = { land: 36, ramp: 10, draw: 10, removal: 8, wipe: 2, counter: 0, protection: 2, tutor: 0, recursion: 1, finisher: 3 };
    if (themes.includes("control")) { q.counter = 6; q.wipe = 4; q.draw = 12; }
    if (themes.includes("landfall")) { q.land = 40; q.ramp = 8; }
    if (themes.includes("aggro") || themes.includes("voltron")) { q.land = 34; q.wipe = 0; q.protection = 5; }
    if (themes.includes("combo")) { q.tutor = 5; }
    if (themes.includes("spellslinger")) { q.counter = 3; q.draw = 12; }
    if (themes.includes("storm")) { q.draw = 12; q.ramp = 12; q.tutor = Math.max(q.tutor ?? 0, 2); }
    if (themes.includes("superfriends")) { q.protection = 4; q.wipe = 3; }
    if (themes.includes("monarch") || themes.includes("goad")) { q.protection = Math.max(q.protection ?? 0, 3); }
    if (profile) q.land = Math.max(30, Math.min(42, Math.round(profile.lands)));
    return q;
  }
  if (format === "oathbreaker") return { land: 21, ramp: 3, draw: 5, removal: 6, wipe: 1, counter: 0, finisher: 2 };
  // 60-card
  const q: Partial<Record<Role, number>> & { land: number } = { land: 23, ramp: 0, draw: 4, removal: 8, wipe: 1, counter: 0, finisher: 3 };
  if (themes.includes("control")) { q.land = 25; q.counter = 8; q.wipe = 3; q.draw = 8; q.removal = 8; }
  if (themes.includes("aggro") || themes.includes("burn")) { q.land = 20; q.draw = 2; q.wipe = 0; }
  if (themes.includes("ramp")) { q.ramp = 8; q.land = 24; }
  return q;
}

