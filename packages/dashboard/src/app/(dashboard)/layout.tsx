"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApiStatus } from "../../components/ApiStatus";
import { ThemeToggle } from "../../components/ThemeToggle";

const NAV = [
  { href: "/runs", label: "Run Explorer", icon: "terminal" },
  { href: "/trends", label: "Promise Trends", icon: "query_stats" },
  { href: "/analytics", label: "Org Analytics", icon: "analytics" },
  { href: "/marketplace", label: "Promise Marketplace", icon: "storefront" },
];

const SETTINGS_NAV = [
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/settings/audit", label: "Audit Logs", icon: "receipt_long" },
  { href: "/settings/compliance", label: "Compliance", icon: "verified_user" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const NavItem = ({ href, label, icon }: { href: string; label: string; icon: string }) => {
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2 rounded-r-full text-sm font-medium transition-colors border-l-2 ${
          isActive 
            ? "border-green bg-surface-raised text-green" 
            : "border-transparent text-text-muted hover:text-text hover:bg-surface-raised"
        }`}
      >
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
        {label}
      </Link>
    );
  };

  return (
    <div className="flex h-screen w-full bg-bg text-text font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-surface flex flex-col relative z-20">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-green text-[20px]">cyclone</span>
            <span className="font-semibold text-text">Sibyl Engine</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-raised text-text-dim border border-border ml-auto">v2.4.0</span>
          </div>
          
          <button className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-red-dim text-red border border-red/20 hover:bg-red/20 transition-colors text-sm font-semibold">
            <span className="material-symbols-outlined text-[18px]">electric_bolt</span>
            Inject Chaos
          </button>
        </div>

        <nav className="flex-1 py-4 pr-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
          
          <div className="my-6 border-t border-border w-[80%] mx-auto" />
          
          <div className="px-5 pb-2 text-[10px] font-mono text-text-dim uppercase tracking-widest">Configuration</div>
          {SETTINGS_NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>
        
        {/* User profile mockup */}
        <div className="p-4 border-t border-border bg-surface">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-raised cursor-pointer transition-colors">
            <div className="h-8 w-8 rounded-full bg-border flex items-center justify-center text-xs font-bold text-text">
              JS
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-text">Jane Smith</div>
              <div className="text-xs text-text-muted truncate">Admin</div>
            </div>
            <span className="material-symbols-outlined text-text-muted text-[20px]">more_vert</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Top App Bar */}
        <header className="h-14 border-b border-border bg-surface-raised flex items-center justify-between px-4 z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center relative">
                 <div className="w-2.5 h-2.5 rounded-full bg-green" />
              </div>
              <span className="font-mono font-semibold text-text">Sibyl</span>
            </Link>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span>Projects</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              <span className="text-text font-medium">checkout-core</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">search</span>
              <input 
                type="text" 
                placeholder="Search resources..." 
                className="w-64 bg-surface border border-border rounded-md pl-9 pr-12 py-1.5 text-sm focus:outline-none focus:border-green transition-colors"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <kbd className="font-sans text-[10px] bg-surface-raised text-text-muted px-1.5 py-0.5 rounded border border-border">⌘</kbd>
                <kbd className="font-sans text-[10px] bg-surface-raised text-text-muted px-1.5 py-0.5 rounded border border-border">K</kbd>
              </div>
            </div>
            
            <ApiStatus />
            <ThemeToggle />
            <Link href="/runs" className="px-3 py-1.5 rounded-md bg-green text-bg text-sm font-semibold hover:bg-green-bright transition-colors hidden sm:block">
              Launch Simulation
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-auto relative z-0 bg-bg">
          {children}
        </div>
      </main>
    </div>
  );
}
