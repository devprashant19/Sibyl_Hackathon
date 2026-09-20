"use client";

import * as React from "react";
import { Card, CodeBlock } from "@sibyl/ui";

export default function Settings() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="font-display text-3xl text-gold mb-2">Settings</h1>
        <p className="text-muted font-body">Manage your organization and API keys.</p>
      </header>

      <Card className="p-6">
        <h2 className="font-display text-xl text-gold mb-4">API Keys</h2>
        <p className="text-sm text-muted mb-6">
          Use these keys to authenticate the Sibyl CLI or SDKs in your CI/CD pipelines.
        </p>

        <div className="space-y-6">
          <div className="p-4 border border-ink-3 rounded-md bg-ink">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-parchment">Default Project Key</span>
              <span className="text-xs text-muted font-mono">Created: Aug 30, 2026</span>
            </div>
            <CodeBlock 
              code="sk_live_sibyl_8f92bd39a0c..." 
              language="bash" 
              className="bg-ink-2"
            />
          </div>

          <button className="px-4 py-2 bg-gold/10 text-gold border border-gold/20 rounded-md font-semibold hover:bg-gold/20 transition-colors font-mono text-sm">
            + Generate New Key
          </button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl text-gold mb-4">Organization Detail</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-parchment mb-1">Organization Name</label>
            <input 
              type="text" 
              disabled
              value="Acme Corp"
              className="w-full bg-ink-2 border border-ink-3 rounded-md px-3 py-2 text-parchment outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-parchment mb-1">Billing Tier</label>
            <div className="flex items-center space-x-3">
              <span className="text-gold font-mono">Pro Plan</span>
              <span className="text-xs text-muted">(Up to 10,000 runs per session)</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
