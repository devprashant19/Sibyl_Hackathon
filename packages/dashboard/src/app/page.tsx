"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Badge, CodeBlock } from "@sibyl/ui";

export default function MarketingLandingPage() {
  const [activeTab, setActiveTab] = useState('home');
  const [typedText, setTypedText] = useState('');
  
  // Oracle console lines from Appendix A
  const consoleLines = [
    { t: 'cmd', v: '$ sibyl run checkout --iterations 400 --faults bank-api-outage\n' },
    { t: 'dim', v: 'searching 400 seeds under simulated outage…\n' },
    { t: 'fail', v: 'seed 0x8f2c → FAIL — every charge gets a receipt\n' },
    { t: 'dim', v: 'gateway sent "pending" · no handler existed · idempotency key locked payment out\n' }
  ];

  useEffect(() => {
    let currentLine = 0;
    let currentChar = 0;
    let text = '';
    
    const typeNext = () => {
      if (currentLine >= consoleLines.length) return;
      const line = consoleLines[currentLine];
      
      text += line.v[currentChar];
      setTypedText(text);
      currentChar++;
      
      if (currentChar >= line.v.length) {
        currentLine++;
        currentChar = 0;
        setTimeout(typeNext, 400); // pause between lines
      } else {
        setTimeout(typeNext, 20); // typing speed
      }
    };
    
    typeNext();
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
            {['home', 'product', 'pricing', 'console'].map(tab => (
              <button 
                key={tab}
                onClick={() => scrollTo(tab)}
                className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition-all ${activeTab === tab ? 'bg-[#caa53a] text-[#1a1200]' : 'text-[#9aa0c0] hover:text-[#ece4d3]'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <Link href="/runs">
            <button className="px-5 py-2.5 rounded-full border border-white/10 text-sm font-bold hover:bg-[#caa53a]/10 hover:border-[#caa53a] transition-all">
              Start free
            </button>
          </Link>
        </div>
      </nav>

      <main className="max-w-[1180px] mx-auto px-8 pt-24 pb-20 space-y-32">
        {/* HERO */}
        <section id="page-home" className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
          <div>
            <div className="font-mono text-xs text-[#caa53a] uppercase tracking-[0.14em] mb-4">Foresight for production systems</div>
            <h1 className="font-serif text-5xl leading-[1.1] font-semibold mb-6">See the failure<br/>before your customers do.</h1>
            <p className="text-lg text-[#9aa0c0] leading-relaxed mb-8 max-w-xl">
              Sibyl runs your real workflows through thousands of simulated futures — dropped connections, duplicate webhooks, mistimed retries — and tells you exactly which one breaks a promise your system can't afford to break.
            </p>
            <div className="flex gap-4 mb-8">
              <Link href="/runs">
                <button className="bg-[#caa53a] text-[#1a1200] font-bold px-6 py-3.5 rounded-lg hover:bg-[#dcb949] transition-all">Start free</button>
              </Link>
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

        {/* PRICING */}
        <section id="page-pricing">
          <div className="font-mono text-xs text-[#caa53a] uppercase tracking-[0.14em] mb-4">Pricing</div>
          <h2 className="font-serif text-4xl font-semibold mb-4">Priced per service.</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
            <div className="bg-[#12162c] border border-white/10 p-8 rounded-2xl">
              <div className="font-mono text-xs text-[#caa53a] uppercase tracking-widest mb-3">Free</div>
              <h3 className="font-serif text-2xl font-semibold mb-2">Seer</h3>
              <div className="text-3xl font-bold mb-6">$0<span className="text-base text-[#9aa0c0] font-normal"> forever</span></div>
              <ul className="text-sm text-[#9aa0c0] space-y-4 mb-8">
                <li className="border-t border-white/5 pt-3"><span className="text-[#caa53a] mr-2">—</span>1 project</li>
                <li className="border-t border-white/5 pt-3"><span className="text-[#caa53a] mr-2">—</span>Unlimited runs</li>
              </ul>
            </div>

            <div className="bg-[#12162c] border border-[#caa53a] p-8 rounded-2xl shadow-[0_0_30px_rgba(202,165,58,0.15)] relative transform md:-translate-y-2">
              <div className="font-mono text-xs text-[#caa53a] uppercase tracking-widest mb-3">Most Popular</div>
              <h3 className="font-serif text-2xl font-semibold mb-2">Oracle</h3>
              <div className="text-3xl font-bold mb-6">$99<span className="text-base text-[#9aa0c0] font-normal"> /service/mo</span></div>
              <ul className="text-sm text-[#9aa0c0] space-y-4 mb-8">
                <li className="border-t border-white/5 pt-3"><span className="text-[#caa53a] mr-2">—</span>Unlimited projects</li>
                <li className="border-t border-white/5 pt-3"><span className="text-[#caa53a] mr-2">—</span>MCTS Search</li>
                <li className="border-t border-white/5 pt-3"><span className="text-[#caa53a] mr-2">—</span>Slack/PagerDuty</li>
              </ul>
              <Link href="/runs"><button className="w-full bg-[#caa53a] text-[#1a1200] font-bold py-3 rounded-lg hover:bg-[#dcb949]">Start free trial</button></Link>
            </div>

            <div className="bg-[#12162c] border border-white/10 p-8 rounded-2xl">
              <div className="font-mono text-xs text-[#caa53a] uppercase tracking-widest mb-3">Enterprise</div>
              <h3 className="font-serif text-2xl font-semibold mb-2">Pythia</h3>
              <div className="text-3xl font-bold mb-6">Custom</div>
              <ul className="text-sm text-[#9aa0c0] space-y-4 mb-8">
                <li className="border-t border-white/5 pt-3"><span className="text-[#caa53a] mr-2">—</span>VPC Deployment</li>
                <li className="border-t border-white/5 pt-3"><span className="text-[#caa53a] mr-2">—</span>SAML SSO & SCIM</li>
              </ul>
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
