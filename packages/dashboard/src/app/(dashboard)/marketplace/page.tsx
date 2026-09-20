"use client";

import * as React from "react";
import { Card, CodeBlock, Badge } from "@sibyl/ui";

const TEMPLATES = [
  {
    id: "stripe-idempotency",
    title: "Stripe Payment Idempotency",
    description: "Ensures duplicate charge requests (e.g., from an upstream HTTP timeout retry) result in exactly one successful charge at Stripe.",
    language: "typescript",
    tags: ["Payments", "HTTP"],
    code: {
      typescript: `import { definePromise, faultConfig } from "@sibyl/sdk-node";\n\ndefinePromise({\n  name: "stripe_no_double_charge",\n  faults: [\n    faultConfig.http.timeout({ target: "api.stripe.com/v1/charges", delayMs: 3000 })\n  ],\n  check: async (ctx) => {\n    // Extract the idempotency key used in the request\n    const requests = ctx.capturedEvents.filter(e => e.type === "HTTP_REQUEST");\n    // Verify only one charge was actually created\n    return true;\n  }\n});`,
      python: `@define_promise(name="stripe_no_double_charge")\ndef test_stripe_idempotency(ctx):\n    faults = [http_timeout("api.stripe.com", delay_ms=3000)]\n    # Verify single charge\n    return True`
    }
  },
  {
    id: "outbox-consistency",
    title: "Outbox Pattern Consistency",
    description: "Guarantees that a database commit and a message queue publish never diverge, even if the worker crashes mid-publish.",
    language: "typescript",
    tags: ["Database", "Queue", "Distributed"],
    code: {
      typescript: `import { definePromise, faultConfig } from "@sibyl/sdk-node";\n\ndefinePromise({\n  name: "outbox_consistency",\n  faults: [\n    faultConfig.process.crash({ probability: 0.5 })\n  ],\n  check: async (ctx) => {\n    // Verify all committed DB rows appear in the Kafka topic\n    return true;\n  }\n});`,
      python: `@define_promise(name="outbox_consistency")\ndef test_outbox(ctx):\n    faults = [process_crash(probability=0.5)]\n    return True`
    }
  },
  {
    id: "webhook-idempotency",
    title: "Generic Webhook Idempotency",
    description: "Validates that receiving the exact same webhook payload twice (e.g. from GitHub or Slack) does not duplicate internal state.",
    language: "typescript",
    tags: ["HTTP", "Integrations"],
    code: {
      typescript: `import { definePromise, faultConfig } from "@sibyl/sdk-node";\n\ndefinePromise({\n  name: "webhook_duplicate_safe",\n  // ...\n});`,
      python: `@define_promise(name="webhook_duplicate_safe")\ndef test_webhook(ctx):\n    pass`
    }
  }
];

export default function Marketplace() {
  const [lang, setLang] = React.useState<"typescript" | "python">("typescript");

  const [imported, setImported] = React.useState<Record<string, boolean>>({});

  const handleImport = (id: string) => {
    setImported(prev => ({ ...prev, [id]: true }));
    // In a real app, this would POST to the API to scaffold the code into the repo
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex justify-between items-end mb-12">
        <div>
          <h1 className="font-display text-4xl text-gold mb-2">Promise Marketplace</h1>
          <p className="text-muted font-body">Pre-built reliability invariants engineered by experts. Import and adapt them instantly.</p>
        </div>
        
        {/* Language Toggle */}
        <div className="flex bg-ink-3 rounded-md p-1">
          <button 
            onClick={() => setLang("typescript")}
            className={`px-4 py-1.5 text-sm font-mono rounded-sm transition-colors ${lang === "typescript" ? "bg-ink text-gold" : "text-muted hover:text-parchment"}`}
          >
            TypeScript
          </button>
          <button 
            onClick={() => setLang("python")}
            className={`px-4 py-1.5 text-sm font-mono rounded-sm transition-colors ${lang === "python" ? "bg-ink text-gold" : "text-muted hover:text-parchment"}`}
          >
            Python
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8">
        {TEMPLATES.map(template => (
          <Card key={template.id} className="p-6 flex flex-col lg:flex-row gap-8">
            <div className="flex-1 space-y-4">
              <div className="flex items-center space-x-3">
                <h2 className="font-display text-2xl text-parchment">{template.title}</h2>
              </div>
              <div className="flex space-x-2">
                {template.tags.map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] uppercase text-muted/80">{t}</Badge>
                ))}
              </div>
              <p className="text-muted text-sm leading-relaxed">
                {template.description}
              </p>
              
              <div className="pt-4">
                <button 
                  onClick={() => handleImport(template.id)}
                  disabled={imported[template.id]}
                  className={`px-6 py-2 rounded-md font-mono text-sm transition-all border ${
                    imported[template.id] 
                      ? "bg-ink text-muted border-ink-3 cursor-not-allowed" 
                      : "bg-gold/10 text-gold border-gold/30 hover:bg-gold/20 font-semibold"
                  }`}
                >
                  {imported[template.id] ? "✓ Imported" : "↓ Import to Project"}
                </button>
              </div>
            </div>

            <div className="lg:w-[500px] shrink-0">
              <CodeBlock 
                code={template.code[lang]} 
                language={lang}
                className="h-full bg-ink-3/30 border-ink-3 m-0"
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
