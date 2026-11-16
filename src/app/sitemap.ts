import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** The public pages. Shared decks (/d/…) are linkable and indexable but not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
    ["", 1, "weekly"],
    ["/build", 0.9, "weekly"],
    ["/upgrade", 0.8, "weekly"],
    ["/collection", 0.8, "monthly"],
    ["/roll", 0.6, "monthly"],
    ["/faq", 0.5, "monthly"],
  ];
  return pages.map(([path, priority, changeFrequency]) => ({ url: `${SITE_URL}${path}`, changeFrequency, priority }));
}
