"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cloudAan, useGebruiker } from "@/lib/cloud";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/planner", label: "Planner" },
];

export default function Header() {
  const pad = usePathname();
  const gebruiker = useGebruiker();
  return (
    <header className="bg-white border-b border-line">
      <div className="mx-auto max-w-[1200px] px-6 py-3.5 flex flex-wrap items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 grow">
          <span className="size-9 rounded-[10px] bg-accent grid place-items-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M8 14l2.5 2.5L16 12" /></svg>
          </span>
          <span className="text-[19px] font-extrabold tracking-tight">Overzicht</span>
        </Link>
        <nav aria-label="Hoofdmenu" className="flex gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`px-3.5 py-2.5 rounded-[10px] text-sm font-semibold ${pad === n.href ? "bg-[#EEF0FF] text-[#3730A3] font-bold" : "text-[#4B5060] hover:bg-ground"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        {cloudAan && (
          <Link href="/login" className="min-h-11 px-3.5 rounded-xl border border-line text-sm font-semibold grid place-items-center hover:bg-ground">
            {gebruiker ? "Account" : "Inloggen"}
          </Link>
        )}
        <Link href="/upload" className="flex items-center gap-2 min-h-11 px-4.5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-[#4338CA]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
          DSW bijwerken
        </Link>
      </div>
    </header>
  );
}
