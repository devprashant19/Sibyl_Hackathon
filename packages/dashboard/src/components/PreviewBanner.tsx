import * as React from "react";

interface PreviewBannerProps {
  /** What would make this page real, e.g. "No audit-log endpoint exists yet." */
  detail?: string;
}

/** Marks pages that render sample data because the API has no backend for them yet. */
export function PreviewBanner({ detail }: PreviewBannerProps) {
  return (
    <div
      role="note"
      data-testid="preview-banner"
      className="border-b border-violet/40 bg-violet/10 px-6 py-2 text-xs font-mono text-parchment flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <span className="rounded-sm bg-violet px-1.5 py-0.5 font-semibold uppercase tracking-wider text-parchment">
        Preview
      </span>
      <span>Sample data, not connected to the API.</span>
      {detail && <span className="text-muted">{detail}</span>}
    </div>
  );
}
