"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cloudAan, useGebruiker } from "@/lib/cloud";

const ICOON = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  planner: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M3 9h18M8 2v4M16 2v4M8 14h3M8 17h6" />
    </>
  ),
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />,
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
};

function Icoon({ naam, maat = 20 }: { naam: keyof typeof ICOON; maat?: number }) {
  return (
    <svg width={maat} height={maat} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICOON[naam]}
    </svg>
  );
}

export default function Header() {
  const pad = usePathname();
  const gebruiker = useGebruiker();
  const nav: { href: string; label: string; icoon: keyof typeof ICOON }[] = [
    { href: "/", label: "Home", icoon: "home" },
    { href: "/planner", label: "Planner", icoon: "planner" },
    { href: "/upload", label: "DSW", icoon: "upload" },
    ...(cloudAan ? [{ href: "/login", label: gebruiker ? "Account" : "Inloggen", icoon: "account" as const }] : []),
  ];

  return (
    <>
      <header className="bg-white/90 backdrop-blur border-b border-line sticky top-0 z-20 sm:static sm:bg-white">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-3 sm:py-3.5 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 grow">
            <span className="size-9 rounded-[10px] bg-accent grid place-items-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M8 14l2.5 2.5L16 12" /></svg>
            </span>
            <span className="text-[19px] font-extrabold tracking-tight">Overzicht</span>
          </Link>
          <nav aria-label="Hoofdmenu" className="hidden sm:flex gap-1">
            {nav.slice(0, 2).map((n) => (
              <Link key={n.href} href={n.href} className={`px-3.5 py-2.5 rounded-[10px] text-sm font-semibold ${pad === n.href ? "bg-[#EEF0FF] text-[#3730A3] font-bold" : "text-[#4B5060] hover:bg-ground"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          {cloudAan && (
            <Link href="/login" className="hidden sm:grid min-h-11 px-3.5 rounded-xl border border-line text-sm font-semibold place-items-center hover:bg-ground">
              {gebruiker ? "Account" : "Inloggen"}
            </Link>
          )}
          <Link href="/upload" className="hidden sm:flex items-center gap-2 min-h-11 px-4.5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-[#4338CA]">
            <Icoon naam="upload" maat={18} />
            DSW bijwerken
          </Link>
        </div>
      </header>

      {/* Telefoon: menu onderin, binnen bereik van je duim */}
      <nav aria-label="Menu" className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {nav.map((n) => {
            const actief = pad === n.href;
            return (
              <Link key={n.href} href={n.href} aria-current={actief ? "page" : undefined} className={`flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-bold ${actief ? "text-accent" : "text-[#7A7F8E]"}`}>
                <span className={`grid place-items-center h-7 w-12 rounded-full ${actief ? "bg-[#EEF0FF]" : ""}`}>
                  <Icoon naam={n.icoon} />
                </span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
