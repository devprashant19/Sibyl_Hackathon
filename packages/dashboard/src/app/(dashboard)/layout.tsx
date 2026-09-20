import * as React from "react";
import Link from "next/link";
import { Badge } from "@sibyl/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-ink text-parchment font-body overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-ink-3 bg-ink-2 flex flex-col">
        <div className="p-6 border-b border-ink-3 flex items-center gap-3">
          <div className="h-6 w-6 rounded-sm bg-gold" />
          <h1 className="font-display text-xl text-gold tracking-wide">Sibyl</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/runs" className="block px-4 py-2 rounded-md hover:bg-ink-3 transition-colors text-sm">
            Run Explorer
          </Link>
          <Link href="/analytics" className="block px-4 py-2 rounded-md hover:bg-ink-3 transition-colors text-sm">
            Org Analytics
          </Link>
          <Link href="/trends" className="block px-4 py-2 rounded-md hover:bg-ink-3 transition-colors text-sm">
            Promise Trends
          </Link>
          <Link href="/marketplace" className="block px-4 py-2 rounded-md hover:bg-ink-3 transition-colors text-sm text-gold/80 hover:text-gold">
            ✦ Promise Marketplace
          </Link>
          <div className="my-2 border-t border-ink-3" />
          <Link href="/settings" className="block px-4 py-2 rounded-md hover:bg-ink-3 transition-colors text-sm">
            Settings
          </Link>
        </nav>

        <div className="p-4 border-t border-ink-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-mono">user@example.com</span>
            <Badge variant="outline">Pro</Badge>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-ink-3 flex items-center justify-between px-6 bg-ink/50 backdrop-blur-sm z-10">
          <div className="flex items-center space-x-4">
            <select className="bg-ink-2 border border-ink-3 rounded-md px-3 py-1 text-sm outline-none focus:border-gold">
              <option>Acme Corp</option>
              <option>Personal</option>
            </select>
            <span className="text-ink-3">/</span>
            <select className="bg-ink-2 border border-ink-3 rounded-md px-3 py-1 text-sm outline-none focus:border-gold">
              <option>Billing Service</option>
              <option>Checkout API</option>
            </select>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-muted flex items-center">
              <span className="w-2 h-2 rounded-full bg-gold animate-pulse mr-2" />
              14 Workers Active
            </span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto relative">
          {children}
        </div>
      </main>
    </div>
  );
}
