/**
 * The site's public origin, for canonical URLs, the sitemap and social previews.
 * NEXT_PUBLIC_SITE_URL wins (set it if you move to a custom domain); on Vercel the production
 * domain is used, so previews still point their canonical links at production.
 */
const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || fromVercel || "https://deckbit.vercel.app").replace(/\/$/, "");

export const SITE_NAME = "Deckbit";
export const SITE_DESCRIPTION = "Build the strongest Commander deck from the Magic cards you already own. Import your collection, pick a commander, theme, bracket and budget, and Deckbit builds and explains every pick.";
