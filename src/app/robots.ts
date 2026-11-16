import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Public tool pages are crawlable; API routes and per-device pages (your saved decks, account, admin) aren't. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/account", "/saved", "/decks"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
