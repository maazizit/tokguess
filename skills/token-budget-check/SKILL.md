---
name: token-budget-check
description: Estimate how many tokens a file, a selection, or a set of files will cost BEFORE sending them to an AI agent, and warn when the context budget is near or over the limit. Use when the user asks "is this file too big?", "how many tokens is this?", "check my context budget", or before loading large files, logs, or whole directories into context.
---

# Token Budget Check

Estimate the token cost of files before they go into the context window, compare it to a budget, and suggest how to trim when needed. 100% local: nothing is sent anywhere.

## When to use

- The user asks how many tokens a file, folder, or pasted text will use.
- You are about to read a large file, log, lockfile, or directory in full.
- The user wants to stay under a context or cost budget.
- A task involves several large files and you must decide what to load.

## How to run

Use the bundled script (Python 3, standard library only):

```bash
python3 scripts/token_budget.py <path> [<path> ...] [--threshold 32000] [--warn-percent 75] [--json]
```

- Paths can be files or directories (directories are scanned recursively; `.git`, `node_modules`, `dist`, `build`, binaries and lockfiles are skipped).
- `--threshold` is the total token budget (default 32000).
- `--warn-percent` is when to warn (default 75).
- `--json` prints machine-readable output.
- Read from stdin with `-` (e.g. `git diff | python3 scripts/token_budget.py -`).

## Reading the result

| Level | Meaning | Action |
|-------|---------|--------|
| 🟢 OK | below the warn percentage | proceed |
| 🟡 WARN | at or above the warn percentage | narrow the context |
| 🔴 OVER | at or above the threshold | trim before sending |

Estimates are approximate (typically within 5-15% of a real tokenizer for English and code). Say "about" when reporting them. Never present them as exact.

## What to do on WARN / OVER

Apply these in order, cheapest first:

1. Read only the relevant line range or function instead of the whole file.
2. Use grep/search to locate the relevant part first.
3. Skip generated files, lockfiles, minified bundles, snapshots, and logs. Summarize them instead.
4. Split the task into steps, each with its own small context.
5. Ask the user which of the largest files matter most (the script lists the top offenders).

## Reporting format

Keep the report short:

```
Context budget: ~18,400 / 32,000 tokens (57%) 🟢
Largest: src/app.ts ~9,100 · src/db.ts ~6,200
```

On WARN/OVER, add one concrete trimming suggestion naming the biggest file.

## How the estimate works

- Base: characters ÷ 4.2.
- Punctuation adds a small correction (+0.4 token per punctuation mark).
- Code-like text gets a +8% boost, since code tokenizes denser than prose.
- With a selection, context = whole file + selection (editors typically send both).

## Notes

- Different models use different tokenizers. For billing-grade numbers, use the provider's token counting API.
- Made by the author of TokGuess, a VS Code extension that tracks real AI token usage from local logs: https://github.com/maazizit/tokguess
