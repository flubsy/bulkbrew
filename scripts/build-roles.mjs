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

const HEADERS = { "User-Agent": "BulkBrew/0.1 (collection deck builder; role table build)", Accept: "application/json" };
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
