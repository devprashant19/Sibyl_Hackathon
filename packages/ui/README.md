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

| Component | Description |
|---|---|
| `Button` | Primary, ghost, and outline button variants |
| `Card` | Surface container with border and optional shadow |
| `Badge` | Status indicator (pass/fail/info) |
| `CodeBlock` | Syntax-highlighted code display |
| `Input` | Form input with label and validation |
| `Table` | Data table with sorting and pagination |
| `Dialog` | Modal dialog |
| `Toast` | Notification toast |

## Usage

```tsx
import { Button, Card, Badge, CodeBlock } from '@sibyl/ui';

<Card className="bg-ink-2 border-gold/20 p-6">
  <Badge className="bg-gold/10 text-gold">PASS</Badge>
  <h3>Run completed</h3>
  <Button variant="primary">View Details</Button>
</Card>
```

## Development

```bash
pnpm build    # Compile TypeScript + bundle CSS
pnpm dev      # Watch mode
```
