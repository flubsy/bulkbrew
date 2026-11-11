import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deckbit",
    short_name: "Deckbit",
    description: "Build the strongest Magic deck from the cards you own.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1324",
    theme_color: "#0b1324",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
