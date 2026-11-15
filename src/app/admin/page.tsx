import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <div className="py-8">
      <h1 className="font-pixel text-[24px] text-cream">
        Admin<span className="text-orange">.</span>
      </h1>
      <div className="mt-6">
        <AdminDashboard />
      </div>
    </div>
  );
}
