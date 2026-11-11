import type { Metadata } from "next";
import { CommanderRoller } from "@/components/commander-roller";
import { DIE, Sprite } from "@/components/sprites";

export const metadata: Metadata = { title: "Roll" };

export default function RollPage() {
  return (
    <div className="py-8">
      <div className="flex items-end gap-4">
        <h1 className="font-pixel text-[24px] text-cream">
          Roll<span className="text-orange">.</span>
        </h1>
        <Sprite grid={DIE} scale={3} className="mb-1" />
      </div>
      <p className="mt-3 max-w-2xl text-[19px] text-cream-dim">Can&apos;t decide what to play? Let the dice pick a commander from your collection, and a way to build it.</p>
      <CommanderRoller />
    </div>
  );
}
