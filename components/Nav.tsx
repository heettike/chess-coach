"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/openings", label: "Openings" },
  { href: "/blunders", label: "Blunders" },
  { href: "/tactics", label: "Tactics" },
  { href: "/coach", label: "Coach" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="14" width="14" height="4" rx="1" fill="var(--accent)" />
            <rect x="5" y="10" width="10" height="4" rx="1" fill="var(--accent)" opacity="0.8" />
            <rect x="7" y="3" width="6" height="7" rx="1" fill="var(--accent)" opacity="0.6" />
            <rect x="8.5" y="1" width="3" height="3" rx="1" fill="var(--accent)" opacity="0.4" />
          </svg>
          <span style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.9rem", letterSpacing: "-0.01em" }}>
            chess coach
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  color: active ? "var(--text)" : "var(--text-muted)",
                  background: active ? "var(--bg-3)" : "transparent",
                  fontSize: "0.8125rem",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  textDecoration: "none",
                  transition: "all 0.1s",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "monospace" }}>
          tiktiktike
        </span>
      </div>
    </header>
  );
}
