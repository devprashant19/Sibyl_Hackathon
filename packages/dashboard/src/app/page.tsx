"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { CodeBlock } from "@sibyl/ui";

// Oracle console lines from Appendix A
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
        timer = setTimeout(typeNext, 400); // pause between lines
      } else {
        timer = setTimeout(typeNext, 20); // typing speed
      }
    };

    timer = setTimeout(typeNext, 0);
    // Stop typing on unmount (and under StrictMode's double-invoked effects).
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
    <div className="min-h-screen bg-[#0a0d1a] text-[#ece4d3] font-sans selection:bg-[#caa53a]/20 selection:text-[#caa53a]">
      {/* Topbar */}
      <nav className="sticky top-0 z-50 bg-[#0a0d1a]/80 backdrop-blur border-b border-white/10">
        <div className="max-w-[1180px] mx-auto px-8 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-[#caa53a] flex items-center justify-center">
               <div className="w-1.5 h-1.5 rounded-full bg-[#caa53a]" />
            </div>
            <span className="font-serif font-semibold text-xl tracking-wide text-[#ece4d3]">Sibyl</span>
          </div>
          
          <div className="hidden md:flex bg-[#12162c] p-1 rounded-full border border-white/10">
            {TABS.map(tab => (
              <button 
                key={tab}
                onClick={() => scrollTo(tab)}
                className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition-all ${activeTab === tab ? 'bg-[#caa53a] text-[#1a1200]' : 'text-[#9aa0c0] hover:text-[#ece4d3]'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <Link href="/runs" className="inline-block text-center px-5 py-2.5 rounded-full border border-white/10 text-sm font-bold hover:bg-[#caa53a]/10 hover:border-[#caa53a] transition-all">Start free</Link>
        </div>
      </nav>

      <main className="max-w-[1180px] mx-auto px-8 pt-24 pb-20 space-y-32">
        {/* HERO */}
        <section id="page-home" className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
          <div>
            <div className="font-mono text-xs text-[#caa53a] uppercase tracking-[0.14em] mb-4">Foresight for production systems</div>
            <h1 className="font-serif text-5xl leading-[1.1] font-semibold mb-6">See the failure<br/>before your customers do.</h1>
            <p className="text-lg text-[#9aa0c0] leading-relaxed mb-8 max-w-xl">
              Sibyl runs your real workflows through thousands of simulated futures — dropped connections, duplicate webhooks, mistimed retries — and tells you exactly which one breaks a promise your system can&apos;t afford to break.
            </p>
            <div className="flex gap-4 mb-8">
              <Link href="/runs" className="inline-block text-center bg-[#caa53a] text-[#1a1200] font-bold px-6 py-3.5 rounded-lg hover:bg-[#dcb949] transition-all">Start free</Link>
              <button onClick={() => scrollTo('product')} className="border border-white/10 font-bold px-6 py-3.5 rounded-lg hover:border-[#caa53a] hover:text-[#caa53a] transition-all">See how it works</button>
            </div>
            <div className="font-mono text-xs text-[#9aa0c0]">Node.js · Python · Java · Go · Runs in your own infra</div>
          </div>

          {/* ORACLE CONSOLE */}
          <div className="bg-gradient-to-b from-[#191f3d] to-[#12162c] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-[#d6564c]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#caa53a]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#5b4e8f]"></div>
              <div className="ml-2 font-mono text-xs text-[#9aa0c0]">sibyl — live</div>
            </div>
            <div className="p-6 font-mono text-sm leading-loose text-white min-h-[240px] whitespace-pre-wrap">
              {typedText}
              <span className="inline-block w-2 h-4 bg-[#caa53a] animate-pulse ml-1 align-middle" />
            </div>
          </div>
        </section>

        {/* DOMAINS */}
        <section id="page-product">
          <div className="font-mono text-xs text-[#caa53a] uppercase tracking-[0.14em] mb-4">Product</div>
          <h2 className="font-serif text-4xl font-semibold mb-4">Fault injection at every boundary.</h2>
          <p className="text-lg text-[#9aa0c0] leading-relaxed mb-10 max-w-2xl">Not just HTTP. Sibyl instruments the real edges where distributed systems fail.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { tag: 'HTTP', title: 'Outbound calls', desc: 'Timeouts, dropped connections, 5xx, slow responses.' },
              { tag: 'Database', title: 'Queries & txns', desc: 'Query timeouts, deadlocks, connection drops.' },
              { tag: 'Queue', title: 'Kafka, SQS', desc: 'Duplicate delivery, message loss, out-of-order.' },
              { tag: 'Process', title: 'Crash recovery', desc: 'Crash, OOM-kill, SIGTERM mid-operation.' }
            ].map(d => (
              <div key={d.tag} className="bg-[#12162c] border border-white/10 p-5 rounded-xl">
                <div className="font-mono text-[11px] text-[#caa53a] uppercase tracking-widest">{d.tag}</div>
                <h4 className="font-bold my-2">{d.title}</h4>
                <p className="text-[13px] text-[#9aa0c0] leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </section>



        {/* CONSOLE */}
        <section id="page-console">
          <div className="font-mono text-xs text-[#caa53a] uppercase tracking-[0.14em] mb-4">Console</div>
          <h2 className="font-serif text-4xl font-semibold mb-4">Every seed, replayable.</h2>
          <p className="text-lg text-[#9aa0c0] leading-relaxed mb-8 max-w-2xl">
            Point the CLI at a Sibyl API and the console shows sessions live, lists every failing run with its fault schedule and event timeline, and gives you the exact command to replay it.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <CodeBlock
              language="shell"
              className="bg-[#12162c] border border-white/10 text-[#ece4d3]"
              code={"$ SIBYL_API_URL=http://localhost:4000 sibyl run checkout\n$ sibyl replay <runId>\n$ sibyl explain <runId>"}
            />
            <div className="flex flex-col gap-3">
              <Link href="/runs" className="inline-block text-center bg-[#caa53a] text-[#1a1200] font-bold px-6 py-3.5 rounded-lg hover:bg-[#dcb949] transition-all">Open the console</Link>
              <Link href="/trends" className="inline-block text-center border border-white/10 font-bold px-6 py-3.5 rounded-lg hover:border-[#caa53a] hover:text-[#caa53a] transition-all">Promise trends</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-12 px-8 text-center text-[#9aa0c0] text-xs">
        <p>© 2026 Sibyl Chaos Engine. Built for the resilient enterprise.</p>
      </footer>
    </div>
  );
}
