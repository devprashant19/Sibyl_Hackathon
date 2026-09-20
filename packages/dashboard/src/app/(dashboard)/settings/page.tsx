"use client";

import * as React from "react";
import { Badge, Card } from "@sibyl/ui";

export default function SettingsPage() {
  const [calendarEnabled, setCalendarEnabled] = React.useState(true);
  const [schedule, setSchedule] = React.useState("0 0 * * *"); // daily
  const [digestEmail, setDigestEmail] = React.useState("team@acme.inc");

  return (
    <div className="flex flex-col h-full w-full">
      <div className="border-b border-ink-3 p-6 bg-ink-2 shrink-0">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-display text-2xl text-gold">Project Settings</h1>
          <p className="text-sm text-muted mt-2">Manage project configuration and automation.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-ink">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <Card className="p-8 bg-ink-2">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="font-display text-xl text-gold flex items-center">
                  <span className="mr-2">📅</span> Chaos Calendar
                </h2>
                <p className="text-sm text-muted mt-1 max-w-2xl">
                  Automatically run low-intensity, real-trace-seeded chaos sessions against your staging environment. 
                  Sibyl stays completely silent unless a vulnerability is found.
                </p>
              </div>
              <Badge variant={calendarEnabled ? "pass" : "fail"} className="text-sm px-3 py-1">
                {calendarEnabled ? "ACTIVE" : "PAUSED"}
              </Badge>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-ink rounded-lg border border-ink-3">
                <div>
                  <h3 className="text-sm font-semibold text-parchment">Automated Staging Tests</h3>
                  <p className="text-xs text-muted mt-1">Run continuous reliability validation in the background.</p>
                </div>
                <button
                  onClick={() => setCalendarEnabled(!calendarEnabled)}
                  className={`px-4 py-2 rounded-md font-semibold text-sm transition-colors ${
                    calendarEnabled 
                      ? 'bg-ink-3 text-parchment hover:bg-ink-3/80' 
                      : 'bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20'
                  }`}
                >
                  {calendarEnabled ? 'Pause Calendar' : 'Resume Calendar'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-parchment mb-2">Schedule (Cron)</label>
                  <input
                    type="text"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    disabled={!calendarEnabled}
                    className="w-full bg-ink border border-ink-3 rounded p-2 text-sm text-parchment outline-none focus:border-gold disabled:opacity-50"
                  />
                  <p className="text-xs text-muted mt-1">Runs daily at midnight UTC</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-parchment mb-2">Weekly Digest Email</label>
                  <input
                    type="email"
                    value={digestEmail}
                    onChange={(e) => setDigestEmail(e.target.value)}
                    disabled={!calendarEnabled}
                    className="w-full bg-ink border border-ink-3 rounded p-2 text-sm text-parchment outline-none focus:border-gold disabled:opacity-50"
                  />
                  <p className="text-xs text-muted mt-1">Sends a summary of all validated permutations.</p>
                </div>
              </div>

              {calendarEnabled && (
                <div className="p-4 bg-violet/5 border border-violet/20 rounded-lg">
                  <h3 className="text-sm font-semibold text-violet mb-2">Next Scheduled Run</h3>
                  <div className="flex space-x-4 text-xs font-mono text-parchment">
                    <span>Target: staging.acme.inc</span>
                    <span>Seed: Prod Traffic (Last 24h)</span>
                    <span>Time: 00:00:00 UTC</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
          
          <Card className="p-8 bg-ink-2 opacity-50">
            <h2 className="font-display text-xl text-gold mb-2">Danger Zone</h2>
            <p className="text-sm text-muted mb-4">Destructive actions for this project.</p>
            <button className="px-4 py-2 bg-ember/10 text-ember border border-ember/30 rounded-md font-semibold text-sm">
              Delete Project
            </button>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
