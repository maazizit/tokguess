---
name: claude-usage-report
description: Report real Claude Code token usage and estimated cost from the local session logs in ~/.claude/projects. Breaks usage down by day, model, project and session, including cache read/write tokens. Use when the user asks "how many tokens did I use?", "what did Claude Code cost me this week?", "which project/session is the most expensive?", or wants to cut their token spend.
---

# Claude Usage Report

Read the JSONL session logs Claude Code already writes locally and turn them into a usage and cost report. The numbers are the real `usage` values returned by the API, not guesses. 100% local: no network, no prompt content is read out or printed, only token counts and metadata.

## When to use

- "How many tokens / how much money did I use today / this week / this month?"
- "Which project or session burns the most tokens?"
- "Is my cache working?" (cache read vs. fresh input)
- The user wants to reduce spend and needs to know where it goes first.

## How to run

Python 3, standard library only:

```bash
python3 scripts/usage_report.py [--days 7] [--since 2026-01-01] [--by day|model|project|session] [--top 10] [--root PATH] [--prices prices.json] [--json]
```

- Default root: `~/.claude/projects` (use `--root` for another location).
- `--days N` limits to the last N days (default 30). `--since YYYY-MM-DD` overrides it.
- `--by` chooses the breakdown (default: shows day, model and project tables).
- `--prices` loads your own per-1M-token rates (see below).
- `--json` prints machine-readable output.

## How tokens are counted

- Only assistant messages with a `usage` block are counted.
- Streaming writes the same request several times. The script keeps the **last** entry per `(session, request)` so nothing is counted twice.
- Four buckets are tracked: input, output, cache read, cache write.
- Cache hit rate = cache read / (cache read + cache write + fresh input).

## Cost

Cost is an **estimate** from a built-in price table (USD per 1M tokens). Cache reads are billed at about 10% of the input rate and cache writes at about 125%. Prices change and subscription plans (Pro/Max) are flat-rate, so the figure is an "API-equivalent" cost, not what the user was billed.

Models missing from the table are priced with a fallback and flagged `~` in the output. To use exact rates, pass a JSON file:

```json
{ "claude-sonnet": {"input": 3, "output": 15}, "claude-opus": {"input": 15, "output": 75} }
```

Keys match by substring of the model name; the longest match wins.

## Reporting to the user

Lead with the total and the biggest lever, then a short table. Example:

```
Last 7 days: 4.2M tokens, ~$18.40 API-equivalent
Cache hit rate: 91%
Top project: my-app (62% of cost)
Suggestion: sessions over 400k context cost most; start fresh sessions per task.
```

Always say the cost is an estimate. Do not quote prompt or file content from the logs.

## Common ways to cut spend (suggest only what the data supports)

- Low cache hit rate: keep prompts and system context stable; avoid editing early in long sessions.
- A few huge sessions: split work into focused sessions and use /clear between tasks.
- Expensive model on simple tasks: use a smaller model for search, renames, formatting.
- Large tool outputs: grep or read line ranges instead of whole files.

## Privacy

The script reads only numeric usage fields, timestamps, model, session id and the project folder name. It never prints message text.

Made by the author of TokGuess, a VS Code extension for tracking AI token usage: https://github.com/maazizit/tokguess
