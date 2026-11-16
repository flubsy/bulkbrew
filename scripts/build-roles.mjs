// Builds src/data/roles.json from Scryfall's community "oracle tags" (Scryfall Tagger).
// These are hand-curated function tags (ramp, removal, draw, …) and are far more accurate
// than regexes over oracle text. Run occasionally:  npm run roles
//
// Respects Scryfall's API guidance: descriptive User-Agent, Accept header, ~8 req/s.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TAGS = {
  ramp: "ramp",
  removal: "removal",
  wipe: "board-wipe",
  draw: "draw",
  tutor: "tutor",
  counter: "counterspell",
  protection: "protection",
  recursion: "recursion",
};

/**
 * Extra function tags (src/data/tags.json) for synergy, payoffs, finishers and themes. Each key
 * lists Tagger slugs to try in order; the first that returns cards wins, and misses are logged
 * so a renamed tag shows up instead of silently doing nothing. Confirmed slugs come first.
 */
const EXTRA = {
  manaDork: ["mana-dork"],
  manaRock: ["mana-rock"],
  sacOutlet: ["sacrifice-outlet", "sac-outlet"],
  deathTrigger: ["death-trigger"],
  altWin: ["alternate-win-condition"],
  winCon: ["win-condition", "wincon", "finisher"],
  tokenMaker: ["token-generator", "creature-token-generator", "token-maker", "makes-tokens"],
  treasureMaker: ["treasure-generator", "treasure-maker", "makes-treasure"],
  anthem: ["anthem"],
  massPump: ["mass-pump", "overrun", "team-pump"],
  drain: ["drain", "life-drain", "lifedrain"],
  burn: ["burn"],
  lifegain: ["lifegain", "life-gain"],
  extraCombat: ["extra-combat", "additional-combat", "extra-combat-phase"],
  mill: ["mill"],
  selfMill: ["self-mill"],
  reanimate: ["reanimate", "reanimation"],
  flicker: ["flicker", "blink"],
  costReducer: ["cost-reducer"],
  ritual: ["ritual"],
  copySpell: ["copy-spell", "spell-copy"],
  spellsMatter: ["spellslinger", "cast-trigger", "spells-matter"],
  untapper: ["untapper"],
  evasion: ["evasion"],
  haste: ["gives-haste", "haste-enabler", "haste-granter"],
  counterPlacer: ["counters-matter", "plus-one-counters", "+1/+1-counters"],
  cardAdvantage: ["card-advantage"],
};

const HEADERS = { "User-Agent": "Deckbit/0.1 (collection deck builder; role table build)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 429) { await sleep(2000 * (i + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`rate limited: ${url}`);
}

const out = { generatedAt: new Date().toISOString(), source: "Scryfall Tagger oracle tags (otag:)", roles: {} };

for (const [role, tag] of Object.entries(TAGS)) {
  const names = new Set();
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`otag:${tag} game:paper`)}&unique=cards&order=name`;
  let pages = 0;
  while (url) {
    const page = await getJson(url);
    for (const c of page.data) names.add(c.name);
    url = page.has_more ? page.next_page : null;
    pages++;
    await sleep(120);
  }
  out.roles[role] = [...names].sort();
  console.log(`${role.padEnd(11)} otag:${tag.padEnd(13)} ${String(names.size).padStart(5)} cards (${pages} pages)`);
}

const file = path.join(process.cwd(), "src", "data", "roles.json");
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(out));
console.log(`wrote ${file}`);

/** All card names for one tag (empty when Scryfall has no such tag: it answers 404). */
async function tagNames(tag) {
  const names = new Set();
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`otag:${tag} game:paper`)}&unique=cards&order=name`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 404) return names;
    if (res.status === 429) { await sleep(2000); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const page = await res.json();
    for (const c of page.data) names.add(c.name);
    url = page.has_more ? page.next_page : null;
    await sleep(120);
  }
  return names;
}

const tags = { generatedAt: new Date().toISOString(), source: "Scryfall Tagger oracle tags (otag:)", slugs: {}, tags: {} };
for (const [key, slugs] of Object.entries(EXTRA)) {
  let hit = null;
  for (const slug of slugs) {
    const names = await tagNames(slug);
    if (names.size) { hit = { slug, names }; break; }
  }
  if (!hit) { console.log(`${key.padEnd(14)} (no tag found: tried ${slugs.join(", ")})`); continue; }
  tags.slugs[key] = hit.slug;
  tags.tags[key] = [...hit.names].sort();
  console.log(`${key.padEnd(14)} otag:${hit.slug.padEnd(24)} ${String(hit.names.size).padStart(5)} cards`);
}
const tagFile = path.join(process.cwd(), "src", "data", "tags.json");
await writeFile(tagFile, JSON.stringify(tags));
console.log(`wrote ${tagFile}`);
