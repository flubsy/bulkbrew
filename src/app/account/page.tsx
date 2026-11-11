import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Account<span className="text-orange">.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[19px] text-cream-dim">Your cards and decks, on every device.</p>
      <div className="mt-8">
        <AccountPanel />
      </div>
    </div>
  );
}
