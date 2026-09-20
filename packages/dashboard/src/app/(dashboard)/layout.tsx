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
    <div className="flex h-screen w-full bg-ink text-parchment font-body overflow-hidden selection:bg-gold/20 selection:text-gold bg-[radial-gradient(ellipse_at_top,_var(--color-ink-2),_transparent_80%)]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-glass-border bg-glass backdrop-blur-xl flex flex-col relative z-20 shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
        <Link href="/" className="p-6 border-b border-glass-border flex items-center gap-3 group">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-gold to-[#f0d473] shadow-[0_0_12px_rgba(226,193,89,0.4)] flex items-center justify-center transition-transform group-hover:scale-105">
            <div className="h-2 w-2 rounded-full bg-ink" />
          </div>
          <span className="font-display font-semibold text-xl text-parchment tracking-wide drop-shadow-sm">Sibyl</span>
        </Link>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-2.5 rounded-lg transition-all duration-300 text-sm font-medium ${
                item.accent 
                  ? "text-gold/90 hover:text-gold hover:bg-gold-dim hover:shadow-[0_0_12px_rgba(226,193,89,0.15)]" 
                  : "text-muted hover:text-parchment hover:bg-white/5"
              }`}
            >
              {item.label}
              {item.preview && <PreviewTag />}
            </Link>
          ))}
          <div className="my-4 border-t border-glass-border" />
          <div className="px-4 pb-2 text-[10px] font-mono text-muted/60 uppercase tracking-widest">Configuration</div>
          {SETTINGS_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-4 py-2.5 rounded-lg text-muted hover:text-parchment hover:bg-white/5 transition-all duration-300 text-sm font-medium"
            >
              {item.label}
              <PreviewTag />
            </Link>
          ))}
        </nav>
        
        {/* User profile mockup */}
        <div className="p-4 border-t border-glass-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-violet to-ink-3 border border-white/10 flex items-center justify-center text-xs font-bold text-white shadow-inner">
              u
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-parchment">user@example.com</div>
              <div className="text-xs text-muted truncate">Free Tier</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-16 border-b border-glass-border flex items-center justify-between px-6 bg-glass backdrop-blur-md z-10 sticky top-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-sm font-medium text-parchment">Local Workspace</span>
          </div>
          <ApiStatus />
        </header>

        <div className="flex-1 overflow-auto relative z-0">
          {children}
        </div>
      </main>
    </div>
  );
}
