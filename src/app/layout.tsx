import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Overzicht",
  description: "Al je toetsen en opdrachten uit de DSW, overzichtelijk op één plek.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body className={`${jakarta.variable} font-sans antialiased min-h-screen`}>
        <Header />
        <main className="mx-auto max-w-[1200px] px-6 pt-7 pb-16 flex flex-col gap-7">{children}</main>
      </body>
    </html>
  );
}
