/**
 * Cheap, local grounding check: finds concrete identifiers cited in a
 * narrative (hostnames, UPPER_SNAKE fault/event types, event ids) that do
 * not appear anywhere in the evidence the narrative was generated from.
 *
 * This is a heuristic. It cannot prove a narrative is correct; it only
 * flags specific identifiers that have no support in the evidence.
 */

const CODE_FILE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'rb', 'java', 'kt',
  'cs', 'php', 'json', 'yaml', 'yml', 'md', 'sql', 'sh', 'toml', 'lock', 'txt', 'log',
]);

const HOSTNAME_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi;
const UPPER_SNAKE_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const EVENT_ID_PATTERN = /\bevent\s+(?:id\s*)?[#:]?\s*([A-Za-z0-9][\w-]*\d[\w-]*)/gi;

function collectEventIds(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectEventIds(item, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'id' && (typeof v === 'string' || typeof v === 'number')) out.add(String(v));
      else collectEventIds(v, out);
    }
  }
}

export function findUngroundedReferences(narrative: string, ...evidence: unknown[]): string[] {
  let corpus = '';
  const knownIds = new Set<string>();
  for (const item of evidence) {
    try {
      corpus += `${JSON.stringify(item) ?? ''}\n`;
    } catch {
      // unserializable evidence contributes nothing
    }
    collectEventIds(item, knownIds);
  }
  const corpusLower = corpus.toLowerCase();
  const ungrounded = new Set<string>();

  for (const match of narrative.match(HOSTNAME_PATTERN) ?? []) {
    const tld = match.slice(match.lastIndexOf('.') + 1).toLowerCase();
    if (CODE_FILE_EXTENSIONS.has(tld)) continue;
    if (!corpusLower.includes(match.toLowerCase())) ungrounded.add(match.toLowerCase());
  }

  for (const match of narrative.match(UPPER_SNAKE_PATTERN) ?? []) {
    if (!corpusLower.includes(match.toLowerCase())) ungrounded.add(match);
  }

  for (const match of narrative.matchAll(EVENT_ID_PATTERN)) {
    const id = match[1];
    if (!knownIds.has(id) && !corpus.includes(id)) ungrounded.add(id);
  }

  return [...ungrounded];
}
