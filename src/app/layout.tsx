import type { Metadata, Viewport } from "next";
import { Pixelify_Sans, Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

// Press Start 2P only for the hero wordmark; Pixelify Sans (taller x-height) for every other heading/label.
const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start", display: "swap" });
const pixelify = Pixelify_Sans({ weight: ["400", "600", "700"], subsets: ["latin"], variable: "--font-pixelify", display: "swap" });
const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Deckbit", template: "%s · Deckbit" },
  description: "Build the strongest Magic deck from the cards you already own. Import your collection, pick a commander, theme, bracket and budget, and let the engine (plus AI) do the rest.",
  applicationName: "Deckbit",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Deckbit", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b1324",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pressStart.variable} ${pixelify.variable} ${vt323.variable} h-full`}>
      <body className="scanlines flex min-h-full flex-col">
        <Nav />
        <main className="pb-tabbar mx-auto w-full max-w-6xl flex-1 px-4">{children}</main>
        <footer className="hidden border-t-4 border-navy-600 py-6 text-center text-[15px] text-muted md:block">
          Card data and prices from Scryfall. Deckbit is unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards.
        </footer>
      </body>
    </html>
  );
}
