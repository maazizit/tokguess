# TokGuess

Track **real** AI token usage from local session logs — plus file estimates before you send.

Inspired by [Token Watch](https://marketplace.visualstudio.com/items?itemName=alvin0-dinhai.token-watch) and [Eating Token](https://marketplace.visualstudio.com/items?itemName=manishsatwani.eatingtoken), but lighter and TokViz-branded.

## How it works

```text
Copilot  → ~/.copilot/session-state/*/events.jsonl  → real tokens
Claude   → ~/.claude/projects/**/*.jsonl            → real tokens
Editor   → chars ÷ 4.2                              → file estimate
```

| Layer | Source | Accuracy |
|-------|--------|----------|
| **Copilot Watcher** | `events.jsonl` (assistant.message, session.shutdown) | Real API tokens |
| **Claude Watcher** | Claude Code JSONL (`message.usage`) | Real API tokens |
| **File Estimator** | Open file in editor | ~90–95% approx. |

No cloud. No prompt content stored — only token counts and metadata.

## Features

- **Context Budget** — alert before send: `file + selection = ~8k / 32k tok`
- **Sidebar dashboard** — cost, trends, models, sessions, budget meter
- **Status bar** — session usage + live budget indicator (🟢🟡🔴)
- **Period filters** — today / 7d / 30d
- **Rescan logs** command for full rebuild

## Context Budget

Estimates what you'd send to Copilot/Claude **before** you send:

```
No selection  → full file tokens
Selection     → file tokens + selection tokens
```

| Level | When |
|-------|------|
| 🟢 OK | Below 75% of threshold (default 32k) |
| 🟡 Warn | ≥ 75% — popup + yellow status bar |
| 🔴 Over | ≥ 100% — warning before context overflow |

## Commands

| Command | Shortcut |
|---------|----------|
| TokGuess: Open Dashboard | `Ctrl+Shift+T` |
| TokGuess: Check Context Budget | — |
| TokGuess: Rescan Logs | — |

## Configuration

| Setting | Default |
|---------|---------|
| `tokguess.budget.threshold` | `32000` |
| `tokguess.budget.warnPercent` | `75` |
| `tokguess.budget.alerts` | `true` |
| `tokguess.sources.copilot.enabled` | `true` |
| `tokguess.sources.claude.enabled` | `true` |
| `tokguess.sources.copilot.path` | `~/.copilot/session-state` |
| `tokguess.sources.claude.path` | `~/.claude/projects` |

## Disclaimer

- **Session tokens** = real counts from local Copilot/Claude logs when available
- **Context Budget** = local file estimate (~90–95%), not official billing
- **Cost** = public API rates (approx.)

## Develop

```bash
npm install && npm run compile
# F5 in VS Code
```

## License

MIT
