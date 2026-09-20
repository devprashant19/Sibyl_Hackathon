"use client";

import * as React from "react";
import { Badge, Button, Card } from "@sibyl/ui";
import { PreviewBanner } from "../../../components/PreviewBanner";

// Sample configuration only: the API has no settings endpoints, so nothing here can be changed.
const SAMPLE_SETTINGS = {
  calendarEnabled: true,
  schedule: "0 0 * * *",
  digestEmail: "team@example.com",
};

export default function SettingsPage() {
  const { calendarEnabled, schedule, digestEmail } = SAMPLE_SETTINGS;

  return (
    <div className="flex flex-col h-full w-full">
      <PreviewBanner detail="Settings are not persisted anywhere; controls are disabled." />
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
              <Badge variant="outline" className="text-sm px-3 py-1">
                SAMPLE
              </Badge>
            </div>

            <fieldset disabled className="space-y-6 opacity-70">
              <div className="flex items-center justify-between p-4 bg-ink rounded-lg border border-ink-3">
                <div>
                  <h3 className="text-sm font-semibold text-parchment">Automated Staging Tests</h3>
                  <p className="text-xs text-muted mt-1">Run continuous reliability validation in the background.</p>
                </div>
                <Button variant="secondary" title="Not available in this preview">
                  {calendarEnabled ? "Pause Calendar" : "Resume Calendar"}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label htmlFor="settings-schedule" className="block text-sm font-semibold text-parchment mb-2">
                    Schedule (Cron)
                  </label>
                  <input
                    id="settings-schedule"
                    type="text"
                    defaultValue={schedule}
                    readOnly
                    className="w-full bg-ink border border-ink-3 rounded p-2 text-sm text-parchment outline-none disabled:opacity-50"
                  />
                  <p className="text-xs text-muted mt-1">Runs daily at midnight UTC</p>
                </div>

                <div>
                  <label htmlFor="settings-digest" className="block text-sm font-semibold text-parchment mb-2">
                    Weekly Digest Email
                  </label>
                  <input
                    id="settings-digest"
                    type="email"
                    defaultValue={digestEmail}
                    readOnly
                    className="w-full bg-ink border border-ink-3 rounded p-2 text-sm text-parchment outline-none disabled:opacity-50"
                  />
                  <p className="text-xs text-muted mt-1">Sends a summary of all validated permutations.</p>
                </div>
              </div>
            </fieldset>
          </Card>

          <Card className="p-8 bg-ink-2 opacity-50">
            <h2 className="font-display text-xl text-gold mb-2">Danger Zone</h2>
            <p className="text-sm text-muted mb-4">Destructive actions for this project.</p>
            <Button disabled className="bg-ember/10 text-ember border border-ember/30 font-semibold" title="Not available in this preview">
              Delete Project
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
