# @sibyl/ui

Shared React component library and design system for the Sibyl dashboard.

## Overview

A collection of reusable React components that implement the Sibyl "Ink and Gold" design system. Used by `packages/dashboard` and available for use in any React-based Sibyl interface.

## Design Tokens

The design system is built around these core tokens:

| Token | Value | Usage |
|---|---|---|
| `--ink` | `#0a0d1a` | Primary background |
| `--ink-2` | `#12162c` | Card/surface background |
| `--ink-3` | `#191f3d` | Elevated surface background |
| `--parchment` | `#ece4d3` | Primary text |
| `--muted` | `#9aa0c0` | Secondary text |
| `--gold` | `#caa53a` | Accent, interactive elements, success |
| `--ember` | `#d6564c` | Error, failure, danger |
| `--violet` | `#5b4e8f` | Secondary accent |

### Typography

| Font | Variable | Usage |
|---|---|---|
| Fraunces | `--display` | Headings, brand text |
| Manrope | `--body` | Body text, UI labels |
| IBM Plex Mono | `--mono` | Code, timestamps, technical labels |

## Components

| Component | Client-only? | Description |
|---|---|---|
| `Button` | no | `primary`, `secondary`, `outline`, `ghost` variants; defaults to `type="button"` |
| `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) | no | Surface container |
| `Badge` | no | Status pill (`default`, `pass`, `fail`, `outline`) |
| `CodeBlock` | no | Monospace code display; optional `language` hint (no highlighting) |
| `ProgressTrack` | no | Progress bar; `value` is clamped to 0..100 |
| `Skeleton` | no | Loading placeholder |
| `EmptyState` | no | Empty / error placeholder with optional action |
| `ErrorBoundary` | yes (`"use client"`) | Class error boundary with retry |
| `OracleConsole` | yes (`"use client"`) | Typing terminal animation; safe with an empty `scenarios` list |

Components marked client-only carry `"use client"`, so the package index can be imported from
Next.js server components. Consumers using Tailwind v4 must add `@source "<path-to>/ui/src";` to
their CSS so classes used only inside these components are generated.

## Usage

```tsx
import { Button, Card, Badge, CodeBlock } from '@sibyl/ui';

<Card className="p-6">
  <Badge variant="pass">PASS</Badge>
  <CodeBlock code="sibyl replay <runId>" language="shell" />
  <Button variant="outline">View Details</Button>
</Card>
```

## Development

```bash
pnpm build    # tsc --build
pnpm test     # vitest (node, static-markup rendering)
pnpm lint     # eslint (flat config in eslint.config.mjs)
```
