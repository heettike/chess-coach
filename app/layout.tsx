import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Chess Coach — tiktiktike",
  description: "Personal chess training powered by your own game history",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
