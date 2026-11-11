import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Pixelify_Sans, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { SyncProvider } from "@/components/sync-provider";

// Press Start 2P only for the hero wordmark; Pixelify Sans (taller x-height) for every other heading/label.
const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start", display: "swap" });
const pixelify = Pixelify_Sans({ weight: ["400", "600", "700"], subsets: ["latin"], variable: "--font-pixelify", display: "swap" });
const atkinson = Atkinson_Hyperlegible({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-atkinson", display: "swap" });

/** Apply the saved font choice before first paint (see the "Preventing flash" guide). */
const FONT_SCRIPT = `try{var f=localStorage.getItem("deckbit.font");if(f)document.documentElement.dataset.font=f}catch(e){}`;

export const metadata: Metadata = {
  title: { default: "BulkBrew", template: "%s · BulkBrew" },
  description: "Build the strongest Magic deck from the cards you already own. Import your collection, pick a commander, theme, bracket and budget, and let the engine (plus AI) do the rest.",
  applicationName: "BulkBrew",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BulkBrew", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b1324",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pressStart.variable} ${pixelify.variable} ${atkinson.variable} h-full`} suppressHydrationWarning>
      <body className="scanlines flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: FONT_SCRIPT }} />
        <SyncProvider>
          <Nav />
          <main className="pb-tabbar mx-auto w-full max-w-6xl flex-1 px-4">{children}</main>
        </SyncProvider>
        <footer className="hidden border-t-4 border-navy-600 py-6 text-center text-[15px] text-muted md:block">
          <a href="/faq" className="text-orange underline underline-offset-4">How BulkBrew works</a> · Card data and prices from Scryfall. BulkBrew is unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards.
        </footer>
      </body>
    </html>
  );
}
