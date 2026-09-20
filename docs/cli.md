# CLI

`sibyl` runs the search. Source: [`packages/cli/src/index.ts`](../packages/cli/src/index.ts).

Not published to npm yet. From the repository: `pnpm sibyl <command>` (runs from the repo root) or
`node packages/cli/bin/sibyl.js <command>` (runs from wherever you are).

Paths in `-c/--config` are relative to the working directory. Sessions are saved next to the config, in
`.sibyl/sessions/`.

## `sibyl init`

Writes a runnable `sibyl.config.ts` into the current directory: a local payment server, a checkout that
retries without an idempotency key, one HTTP fault template and one promise. `--force` overwrites.

## `sibyl run`

Runs a search session.

| Option | Default | |
|---|---|---|
| `-c, --config <file>` | `sibyl.config.ts` | |
| `-n, --iterations <n>` | config, else 100 | Counted runs. Duplicate schedules do not count. |
| `--concurrency <n>` | config, else 1 | Runs in parallel in this process |
| `-s, --seed <seed>` | config, else random | Printed and saved either way |
| `--strategy <name>` | config, else `ucb1` | `ucb1`, `mcts`, `bayesian` |
| `--clock <mode>` | config, else `realtime` | `accelerated` makes timers fire instantly |
| `--timeout <ms>` | config, else 30000 | Per-run; exceeding it is ERRORED |
| `--early-exit` | off | Stop at the first run that does not pass |
| `--junit <file>` | — | Write a JUnit XML report |
| `--no-upload` | — | Ignore `SIBYL_API_URL` |
| `-u, --update-snapshots` | — | Rewrite `snapshotPromise` golden files |

Prints a progress bar (or a line per 10% when not a terminal), then a summary: counts, seed, where the
session was saved, and up to five runs that did not pass — FAILED before INTERMITTENT, fewest faults
first — with the promises they broke and a `sibyl replay` command. Uploads the session if `SIBYL_API_URL`
is set; an upload failure is a warning.

Exit code 0 unless Sibyl itself fails (bad config, crash). Use `ci` to fail on findings.

## `sibyl ci`

`run` without interactive output. Exits **1** if any run FAILED, ERRORED or was INTERMITTENT.

| Extra option | |
|---|---|
| `--allow-intermittent` | Don't fail the build for INTERMITTENT runs |
| `--require-upload` | Fail if the upload to `SIBYL_API_URL` fails |

```yaml
# GitHub Actions
- run: pnpm install
- run: pnpm sibyl ci -c path/to/sibyl.config.ts -n 200 --seed ${{ github.run_id }} --junit reports/sibyl.xml
  env:
    SIBYL_API_URL: ${{ secrets.SIBYL_API_URL }}
    SIBYL_API_TOKEN: ${{ secrets.SIBYL_API_TOKEN }}
```

## `sibyl replay <runId>`

Re-executes one run with its original seed and concrete schedules. `runId` may be a unique prefix of
at least 4 characters. Looks in `.sibyl/sessions` next to the config first, then at `SIBYL_API_URL`.

| Option | |
|---|---|
| `-c, --config <file>` | The config whose workflow to run |
| `--events` | Print the replayed event timeline |

Result:

- `✔ Reproduced: same outcome and same fault decisions.` — exit 0.
- `~ The original run was intermittent; this replay passed/failed.` — exit 0.
- `✗ Did not reproduce: …` — exit 1. The workflow depends on something the seed does not control.

"Fault decisions" compares each captured event's domain, fault type and payload, ignoring timestamps and
loopback port numbers. Runs that passed have no stored timeline, so only their outcome is compared.

## `sibyl sessions`

Lists sessions saved next to the config, newest first. `-n, --limit` (default 10).

## `sibyl explain <runId>`

Asks Claude for a root-cause explanation of a run that did not pass, given its captured events, its
schedules and the failed promises with their descriptions. Needs `ANTHROPIC_API_KEY`.

Reports when the explanation mentions hostnames, fault types or event ids that are not in the evidence.
`--suggest-fix <files...>` also drafts a unified diff for those files into `sibyl-fix-handoff.md`; review it
before applying, and verify with `sibyl replay`.

## `sibyl investigate "<bug report>"`

Turns a plain-English bug report into a proposed fault schedule template, using the promises in your
config and the events of your latest session as context. Prints the template to add to `templates`, or a
clarifying question. Needs `ANTHROPIC_API_KEY`.

## `sibyl retro <postmortem.md>`

Drafts promises and fault templates from an incident postmortem. Needs `ANTHROPIC_API_KEY`. The output is
a draft to review, not code to paste blind.

## `sibyl doctor`

Checks the config loads and is valid, the API at `SIBYL_API_URL` is reachable and whether it needs a
token, whether `ANTHROPIC_API_KEY` looks right (format only, no network call), and whether Docker is
reachable. Exit 1 if anything failed; missing optional pieces are `SKIP`, not failures.

## AI commands when AI is unavailable

No key, `SIBYL_DISABLE_AI` set, budget exceeded, or the API unreachable: `explain`, `investigate` and
`retro` print why, and `explain` prints the captured evidence instead. They do not crash.
