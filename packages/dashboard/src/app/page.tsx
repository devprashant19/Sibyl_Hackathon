"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Button, Card, Badge, CodeBlock } from "@sibyl/ui";
import Link from "next/link";

export default function MarketingLandingPage() {
  const [activeTab, setActiveTab] = useState('home');
  const [typedText, setTypedText] = useState('');
  
  const consoleLines = [
    "> sibyl run ./app --promise no-lost-updates",
    "Initializing Monte Carlo Tree Search...",
    "Injecting 50ms latency to api.stripe.com...",
    "Dropping Postgres connection (port 5432)...",
    "PROMISE BROKEN: Orphaned record found.",
    "SibylExplainer: Root cause identified. Patch generated."
  ];

  useEffect(() => {
    let currentLine = 0;
    let currentChar = 0;
    let text = '';
    
    const interval = setInterval(() => {
      if (currentLine < consoleLines.length) {
        if (currentChar < consoleLines[currentLine].length) {
          text += consoleLines[currentLine][currentChar];
          setTypedText(text);
          currentChar++;
        } else {
          text += '\n';
          setTypedText(text);
          currentLine++;
          currentChar = 0;
        }
      } else {
        clearInterval(interval);
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, []);

  const scrollTo = (id: string) => {
    setActiveTab(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-ink text-parchment font-sans selection:bg-gold/30">
      
      {/* Sticky Nav */}
      <nav className="sticky top-0 z-50 bg-ink/90 backdrop-blur border-b border-ink-3">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="font-display text-xl text-gold font-bold tracking-widest">SIBYL</div>
          <div className="hidden md:flex space-x-8 text-sm font-medium text-muted">
            <button onClick={() => scrollTo('home')} className={`hover:text-gold transition-colors ${activeTab === 'home' ? 'text-gold' : ''}`}>Home</button>
            <button onClick={() => scrollTo('product')} className={`hover:text-gold transition-colors ${activeTab === 'product' ? 'text-gold' : ''}`}>Product</button>
            <button onClick={() => scrollTo('pricing')} className={`hover:text-gold transition-colors ${activeTab === 'pricing' ? 'text-gold' : ''}`}>Pricing</button>
            <button onClick={() => scrollTo('console')} className={`hover:text-gold transition-colors ${activeTab === 'console' ? 'text-gold' : ''}`}>Console</button>
          </div>
          <Link href="/runs">
            <Button className="bg-gold text-ink font-bold hover:bg-gold/90 transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)]">
              Console Sign In
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="home" className="pt-32 pb-24 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gold/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="z-10">
            <Badge className="bg-ink-3 text-gold mb-6 border-gold/20">Sibyl 2.0 is now in General Availability</Badge>
            <h1 className="text-5xl md:text-6xl font-display font-bold text-parchment leading-tight mb-6">
              Deterministic Chaos for <span className="text-gold">Distributed Systems.</span>
            </h1>
            <p className="text-lg text-muted mb-8 leading-relaxed">
              Stop relying on random monkeys to test your microservices. Sibyl uses Coverage-Guided Search (MCTS) to deterministically hunt for the exact concurrency and network faults that break your business invariants.
            </p>
            <div className="flex space-x-4">
              <Link href="/runs">
                <Button className="bg-gold text-ink font-bold h-12 px-8 hover:bg-gold/90 transition-all">
                  Start Free Trial
                </Button>
              </Link>
              <Button variant="outline" className="border-ink-3 text-parchment h-12 px-8 hover:bg-ink-2">
                Read the Docs
              </Button>
            </div>
          </div>

          {/* Live Typing Oracle Console */}
          <div className="z-10">
            <div className="bg-[#0a0a0a] border border-ink-3 rounded-lg shadow-2xl overflow-hidden font-mono text-sm">
              <div className="bg-ink-2 px-4 py-3 flex items-center space-x-2 border-b border-ink-3">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-4 text-muted text-xs">sibyl-engine ~ bash</span>
              </div>
              <div className="p-6 h-[280px] text-green-400/90 whitespace-pre-wrap flex flex-col justify-end">
                {typedText}
                <span className="animate-pulse inline-block w-2 h-4 bg-green-400 ml-1 translate-y-1" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works / Process */}
      <section id="product" className="py-24 px-6 bg-ink-2 border-y border-ink-3">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-display text-gold mb-4">Coverage-Guided Chaos</h2>
            <p className="text-muted max-w-2xl mx-auto">A deterministic approach to reliability engineering.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 relative">
            <div className="hidden md:block absolute top-6 left-12 right-12 h-px bg-ink-3" />
            
            {[
              { title: "Define Promises", desc: "Write business invariants (e.g. no double charges) using the SDK." },
              { title: "Wrap App", desc: "Sibyl intercepts Network, DB, and MQ traffic seamlessly." },
              { title: "MCTS Search", desc: "The engine hunts for the exact fault sequence that breaks the promise." },
              { title: "Root Cause", desc: "AI agents analyze the trace and explain exactly why the system failed." },
              { title: "Fix & Verify", desc: "Apply the generated patch and add the test to your CI regression suite." }
            ].map((step, i) => (
              <div key={i} className="relative z-10 text-center">
                <div className="w-12 h-12 mx-auto bg-ink border-2 border-gold text-gold rounded-full flex items-center justify-center font-bold font-display text-lg mb-6 shadow-[0_0_10px_rgba(212,175,55,0.2)]">
                  {i + 1}
                </div>
                <h3 className="text-parchment font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-muted">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Incident Timeline & Features */}
      <section className="py-24 px-6 bg-ink">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
          
          <div>
            <h2 className="text-3xl font-display text-gold mb-8">Stop Debugging at 3:00 AM</h2>
            <div className="space-y-6">
              <Card className="bg-ink-2 border-red-500/20 p-6">
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 mb-3">Traditional Incident Response</Badge>
                <p className="text-muted text-sm line-through decoration-red-500/50">
                  Customer reports an issue. PagerDuty fires at 3 AM. Engineers hunt through logs for 6 hours trying to reproduce a 50ms network race condition.
                </p>
              </Card>
              <Card className="bg-ink-2 border-gold/20 p-6 shadow-[0_0_20px_rgba(212,175,55,0.05)]">
                <Badge className="bg-gold/10 text-gold border-gold/20 mb-3">With Sibyl</Badge>
                <p className="text-parchment text-sm">
                  The race condition is found deterministically in your CI pipeline before deployment. The Sibyl AI generates the root-cause explanation and the fix PR automatically.
                </p>
              </Card>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-4">
              <div className="p-4 border border-ink-3 rounded bg-ink-2">
                <div className="text-gold mb-2">🌐 Network</div>
                <div className="text-xs text-muted">Latency, Drops, HTTP 500s</div>
              </div>
              <div className="p-4 border border-ink-3 rounded bg-ink-2">
                <div className="text-gold mb-2">🗄️ Database</div>
                <div className="text-xs text-muted">Deadlocks, Disconnects</div>
              </div>
              <div className="p-4 border border-ink-3 rounded bg-ink-2">
                <div className="text-gold mb-2">📬 Message Queues</div>
                <div className="text-xs text-muted">Duplicate Deliveries, Out-of-order</div>
              </div>
              <div className="p-4 border border-ink-3 rounded bg-ink-2">
                <div className="text-gold mb-2">💻 Node Resources</div>
                <div className="text-xs text-muted">CPU Starvation, OOM Kills</div>
              </div>
            </div>
          </div>

          <div>
            <div className="bg-[#0a0a0a] rounded-lg border border-ink-3 p-6 h-full shadow-2xl">
              <h3 className="text-sm text-muted mb-4 font-mono">checkout-promise.ts</h3>
              <CodeBlock 
                language="typescript"
                code={`import { definePromise } from '@sibyl/sdk';

export const checkoutPromise = definePromise({
  id: 'checkout-idempotency',
  name: 'No Double Charges',
  evaluate: async () => {
    // Assert against the real database state
    const dupes = await db.query(
      'SELECT count(*) FROM charges WHERE duplicate = true'
    );
    
    if (dupes > 0) {
      return { pass: false, message: 'Double charge detected' };
    }
    
    return { pass: true, message: 'Idempotent execution' };
  }
});`}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-ink-2 border-y border-ink-3">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-display text-gold mb-4">Simple, Predictable Pricing</h2>
            <p className="text-muted">Priced per service, never per engineer.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-ink border-ink-3 p-8 flex flex-col">
              <h3 className="text-xl font-display text-parchment mb-2">Seer</h3>
              <div className="text-3xl font-bold text-gold mb-6">$0<span className="text-sm text-muted font-normal">/mo</span></div>
              <ul className="space-y-3 text-sm text-muted mb-8 flex-1">
                <li>✓ 1 Project</li>
                <li>✓ 50 Runs / month</li>
                <li>✓ 7-Day History</li>
                <li>✓ Basic Fault Domains</li>
              </ul>
              <Button variant="outline" className="w-full border-ink-3 text-parchment hover:bg-ink-3">Get Started</Button>
            </Card>

            <Card className="bg-ink border-gold p-8 flex flex-col relative shadow-[0_0_30px_rgba(212,175,55,0.15)] transform md:-translate-y-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gold text-ink text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Most Popular</div>
              <h3 className="text-xl font-display text-parchment mb-2">Oracle</h3>
              <div className="text-3xl font-bold text-gold mb-6">$49<span className="text-sm text-muted font-normal">/service/mo</span></div>
              <ul className="space-y-3 text-sm text-muted mb-8 flex-1">
                <li>✓ Unlimited Projects</li>
                <li>✓ Unlimited Runs</li>
                <li>✓ 30-Day History</li>
                <li>✓ Full AI Remediation Agent</li>
                <li>✓ GitHub App CI Integration</li>
              </ul>
              <Button className="w-full bg-gold text-ink font-bold hover:bg-gold/90">Start 14-Day Trial</Button>
            </Card>

            <Card className="bg-ink border-ink-3 p-8 flex flex-col">
              <h3 className="text-xl font-display text-parchment mb-2">Pythia</h3>
              <div className="text-3xl font-bold text-gold mb-6">Custom</div>
              <ul className="space-y-3 text-sm text-muted mb-8 flex-1">
                <li>✓ Self-Hosted VPC Deployment</li>
                <li>✓ Custom Data Retention</li>
                <li>✓ SAML 2.0 & OIDC SSO</li>
                <li>✓ SCIM Directory Sync</li>
                <li>✓ Immutable Audit Logging</li>
              </ul>
              <Button variant="outline" className="w-full border-ink-3 text-parchment hover:bg-ink-3">Contact Sales</Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Lightly-Gated Demo Console */}
      <section id="console" className="py-24 px-6 bg-ink relative">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl font-display text-gold mb-6">Experience the Engine</h2>
          <p className="text-muted mb-12">Sign in to your free Seer account to trigger live simulation runs and view AI root-cause analysis directly in the interactive console.</p>
          
          <div className="bg-ink-2 border border-ink-3 p-8 rounded-lg shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center opacity-100 group-hover:bg-ink/80 transition-all">
              <span className="text-4xl mb-4">🔒</span>
              <h3 className="text-xl font-display text-gold mb-4">Console Access Restricted</h3>
              <Link href="/runs">
                <Button className="bg-gold text-ink font-bold hover:bg-gold/90">Sign in to access Interactive Demo</Button>
              </Link>
            </div>
            
            {/* Blurred Mock UI Behind the Gate */}
            <div className="opacity-30 pointer-events-none select-none blur-[2px]">
              <div className="flex justify-between items-center mb-6 border-b border-ink-3 pb-4">
                <div className="font-mono text-sm text-parchment">Target: payment-service</div>
                <Button variant="outline" className="border-gold text-gold cursor-not-allowed">Run Simulation (MCTS)</Button>
              </div>
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-ink p-4 border border-ink-3 rounded flex justify-between items-center">
                    <div>
                      <div className="text-sm text-parchment font-bold">Run #{840 + i}</div>
                      <div className="text-xs text-muted">Promises: 2 Passed, 1 Failed</div>
                    </div>
                    <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Promise Broken</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-3 bg-ink-2 py-12 px-6 text-center text-sm text-muted">
        <div className="font-display text-lg text-gold mb-4">SIBYL</div>
        <p>© 2026 Sibyl Chaos Engine. Built for the resilient enterprise.</p>
      </footer>
    </div>
  );
}
