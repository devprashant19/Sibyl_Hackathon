"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ThemeToggle } from "../components/ThemeToggle";

// Oracle console lines
const CONSOLE_LINES = [
  { t: 'cmd', v: '$ sibyl run checkout --iterations 400 --faults bank-api-outage\n' },
  { t: 'dim', v: 'searching 400 seeds under simulated outage…\n' },
  { t: 'fail', v: 'seed 0x8f2c → FAIL — every charge gets a receipt\n' },
  { t: 'dim', v: 'gateway sent "pending" · no handler existed · idempotency key locked payment out\n' }
];

const TABS = ['home', 'product', 'console'] as const;

export default function MarketingLandingPage() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [typedText, setTypedText] = useState('');

  useEffect(() => {
    let currentLine = 0;
    let currentChar = 0;
    let text = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const typeNext = () => {
      if (cancelled || currentLine >= CONSOLE_LINES.length) return;
      const line = CONSOLE_LINES[currentLine];

      text += line.v[currentChar];
      setTypedText(text);
      currentChar++;

      if (currentChar >= line.v.length) {
        currentLine++;
        currentChar = 0;
        timer = setTimeout(typeNext, 400);
      } else {
        timer = setTimeout(typeNext, 20);
      }
    };

    timer = setTimeout(typeNext, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const scrollTo = (id: string) => {
    setActiveTab(id);
    document.getElementById(`page-${id}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-green/20 selection:text-green">
      {/* Topbar */}
      <nav className="sticky top-0 z-50 bg-surface/80 backdrop-blur border-b border-border">
        <div className="max-w-[1180px] mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 flex items-center justify-center relative">
               <div className="w-2.5 h-2.5 rounded-full bg-green animate-pulse" />
            </div>
            <span className="font-mono font-semibold text-lg tracking-wide text-text">Sibyl</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-green-dim text-green-bright border border-green/20 ml-2">v2.4.0</span>
          </div>
          
          <div className="hidden md:flex gap-6">
            {TABS.map(tab => (
              <button 
                key={tab}
                onClick={() => scrollTo(tab)}
                className={`text-sm font-sans capitalize transition-all ${activeTab === tab ? 'text-green border-b-2 border-green' : 'text-text-muted hover:text-text'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/runs" className="hidden sm:inline-block px-4 py-1.5 rounded-md bg-green text-bg text-sm font-semibold hover:bg-green-bright transition-colors">Launch Simulation</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-[1180px] mx-auto px-8 pt-24 pb-20 space-y-32 relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-40 dark:opacity-20 pointer-events-none -z-10 [mask-image:linear-gradient(to_bottom,white,transparent)]" />
        
        {/* HERO */}
        <section id="page-home" className="grid grid-cols-1 lg:grid-cols-12 gap-14 items-center">
          <div className="lg:col-span-6">
            <div className="inline-block px-3 py-1 rounded-full border border-border bg-surface text-xs font-mono text-text-muted mb-6">
              Foresight for production systems
            </div>
            <h1 className="font-sans text-5xl md:text-6xl leading-[1.1] font-semibold mb-6">
              See the failure <br/> before they do.
            </h1>
            <p className="text-lg text-text-muted leading-relaxed mb-8 max-w-xl">
              Sibyl runs your real workflows through thousands of simulated futures — dropped connections, duplicate webhooks, mistimed retries — and tells you exactly which one breaks a promise your system can&apos;t afford to break.
            </p>
            <div className="flex flex-wrap gap-4 mb-10">
              <Link href="/runs" className="inline-block bg-green text-bg font-semibold px-6 py-3 rounded-lg hover:bg-green-bright transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                Launch Simulation
              </Link>
              <button onClick={() => scrollTo('product')} className="border border-border font-semibold px-6 py-3 rounded-lg hover:border-text hover:text-text transition-all bg-surface">
                See how it works
              </button>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-mono text-text-muted">
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">code</span> Node.js</span>
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">terminal</span> Python</span>
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">coffee</span> Java</span>
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">build</span> Go</span>
            </div>
          </div>

          {/* ORACLE CONSOLE (Kept from existing) */}
          <div className="lg:col-span-6">
            <div className="bg-[#060e20] border border-[#2d3449] rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2d3449] bg-[#0b1326]">
                <div className="w-3 h-3 rounded-full bg-red"></div>
                <div className="w-3 h-3 rounded-full bg-amber"></div>
                <div className="w-3 h-3 rounded-full bg-green"></div>
                <div className="ml-2 font-mono text-xs text-[#94a3b8]">sibyl — live</div>
              </div>
              <div className="p-6 font-mono text-sm leading-loose text-[#dae2fd] min-h-[260px] whitespace-pre-wrap">
                {typedText}
                <span className="inline-block w-2 h-4 bg-green animate-pulse ml-1 align-middle" />
              </div>
              <div className="px-4 py-2 border-t border-[#2d3449] bg-[#0b1326] text-xs font-mono text-[#64748b] flex justify-between">
                <span>Status: Simulating</span>
                <span>400/400</span>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: '01', icon: 'integration_instructions', title: 'Connect your system', desc: 'Add the lightweight agent to your services. No code changes required for standard HTTP/gRPC.' },
            { step: '02', icon: 'cyclone', title: 'Define the chaos', desc: 'Configure fault scenarios: latency spikes, connection drops, or pod evictions.' },
            { step: '03', icon: 'monitoring', title: 'Observe promises', desc: 'Watch how your business logic holds up under pressure, before reaching production.' }
          ].map(d => (
            <div key={d.step} className="bg-surface border border-border p-8 rounded-2xl hover:border-green/50 transition-colors">
              <div className="flex justify-between items-start mb-6">
                <span className="font-mono text-4xl font-bold text-text-dim/30">{d.step}</span>
                <span className="material-symbols-outlined text-green text-3xl">{d.icon}</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">{d.title}</h3>
              <p className="text-text-muted leading-relaxed mb-6">{d.desc}</p>
            </div>
          ))}
        </section>

        {/* DOMAINS */}
        <section id="page-product">
          <div className="font-mono text-xs text-green uppercase tracking-[0.14em] mb-4">Fault Boundaries</div>
          <h2 className="font-sans text-4xl font-semibold mb-4">Injection at every boundary.</h2>
          <p className="text-lg text-text-muted leading-relaxed mb-10 max-w-2xl">Not just HTTP. Sibyl instruments the real edges where distributed systems fail.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { tag: 'Layer 7', title: 'Outbound calls', desc: 'Timeouts, dropped connections, 5xx, slow responses.' },
              { tag: 'Storage', title: 'Queries & txns', desc: 'Query timeouts, deadlocks, connection drops.' },
              { tag: 'Async', title: 'Kafka, SQS', desc: 'Duplicate delivery, message loss, out-of-order.' },
              { tag: 'Kernel', title: 'Crash recovery', desc: 'Crash, OOM-kill, SIGTERM mid-operation.' }
            ].map(d => (
              <div key={d.tag} className="bg-surface border border-border p-6 rounded-xl hover:shadow-lg transition-shadow">
                <div className="inline-block px-2 py-1 rounded bg-surface-raised border border-border font-mono text-[11px] text-text-muted tracking-widest mb-4">{d.tag}</div>
                <h4 className="font-semibold text-lg mb-2">{d.title}</h4>
                <p className="text-sm text-text-muted leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CONSOLE */}
        <section id="page-console" className="bg-surface-raised border border-border rounded-3xl p-10 md:p-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="font-mono text-xs text-green uppercase tracking-[0.14em] mb-4">Console</div>
              <h2 className="font-sans text-4xl font-semibold mb-6">Every seed, replayable.</h2>
              <p className="text-lg text-text-muted leading-relaxed mb-8">
                Point the CLI at a Sibyl API and the console shows sessions live, lists every failing run with its fault schedule and event timeline, and gives you the exact command to replay it.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/runs" className="text-center bg-green text-bg font-semibold px-6 py-3 rounded-lg hover:bg-green-bright transition-all">Open the console</Link>
                <Link href="/trends" className="text-center border border-border bg-surface font-semibold px-6 py-3 rounded-lg hover:border-text hover:text-text transition-all">Promise trends</Link>
              </div>
            </div>
            <div className="bg-[#060e20] border border-[#2d3449] p-6 rounded-xl font-mono text-sm text-[#dae2fd] shadow-xl relative group">
              <button className="absolute top-4 right-4 text-[#64748b] hover:text-white transition-colors" title="Copy to clipboard">
                <span className="material-symbols-outlined text-lg">content_copy</span>
              </button>
              <div className="text-green-bright mb-2">$ npm install -g @sibyl/cli</div>
              <div className="text-[#94a3b8] mb-4"># Start a chaos simulation</div>
              <div className="text-white">$ SIBYL_API_URL=http://localhost:4000 sibyl run checkout</div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-12 px-8">
        <div className="max-w-[1180px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center">
               <div className="w-2 h-2 rounded-full bg-green" />
            </div>
            <span className="font-mono font-semibold text-text">Sibyl</span>
          </div>
          <div className="flex gap-6 text-sm text-text-muted font-sans">
            <Link href="#" className="hover:text-text">Documentation</Link>
            <Link href="#" className="hover:text-text">API Reference</Link>
            <Link href="#" className="hover:text-text">GitHub</Link>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-text-muted border border-border px-3 py-1.5 rounded-full bg-surface-raised">
             <div className="w-2 h-2 rounded-full bg-green animate-pulse" /> All systems operational
          </div>
        </div>
      </footer>
    </div>
  );
}
