import * as React from "react";
import Link from "next/link";
import { ApiStatus } from "../../components/ApiStatus";

const NAV: { href: string; label: string; preview?: boolean; accent?: boolean }[] = [
  { href: "/runs", label: "Run Explorer" },
  { href: "/trends", label: "Promise Trends" },
  { href: "/analytics", label: "Org Analytics", preview: true },
  { href: "/marketplace", label: "✦ Promise Marketplace", preview: true, accent: true },
];

const SETTINGS_NAV = [
  { href: "/settings", label: "Settings" },
  { href: "/settings/audit", label: "Audit Logs" },
  { href: "/settings/compliance", label: "Compliance" },
];

function PreviewTag() {
  return <span className="ml-2 rounded-sm border border-violet/40 px-1 text-[10px] font-mono uppercase text-muted">preview</span>;
}

// Server component: it only imports client components (ApiStatus) and server-safe markup.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-ink text-parchment font-body overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-ink-3 bg-ink-2 flex flex-col">
        <Link href="/" className="p-6 border-b border-ink-3 flex items-center gap-3">
          <div className="h-6 w-6 rounded-sm bg-gold" />
          <span className="font-display text-xl text-gold tracking-wide">Sibyl</span>
        </Link>

        <nav className="flex-1 p-4 space-y-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-2 rounded-md hover:bg-ink-3 transition-colors text-sm ${
                item.accent ? "text-gold/80 hover:text-gold" : ""
              }`}
            >
              {item.label}
              {item.preview && <PreviewTag />}
            </Link>
          ))}
          <div className="my-2 border-t border-ink-3" />
          {SETTINGS_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-4 py-2 rounded-md hover:bg-ink-3 transition-colors text-sm"
            >
              {item.label}
              <PreviewTag />
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-ink-3 flex items-center justify-between px-6 bg-ink/50 backdrop-blur-sm z-10">
          <span className="text-sm text-muted font-mono">Local workspace</span>
          <ApiStatus />
        </header>

        <div className="flex-1 overflow-auto relative">{children}</div>
      </main>
    </div>
  );
}
