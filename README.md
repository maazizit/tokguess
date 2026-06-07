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

- **Sidebar dashboard** — cost, trends, models, sessions
- **Status bar** — today's tokens + estimated cost
- **Period filters** — today / 7d / 30d
- **Rescan logs** command for full rebuild

## Commands

| Command | Shortcut |
|---------|----------|
| TokGuess: Open Dashboard | `Ctrl+Shift+T` |
| TokGuess: Rescan Logs | — |

## Configuration

| Setting | Default |
|---------|---------|
| `tokguess.sources.copilot.enabled` | `true` |
| `tokguess.sources.claude.enabled` | `true` |
| `tokguess.sources.copilot.path` | `~/.copilot/session-state` |
| `tokguess.sources.claude.path` | `~/.claude/projects` |

## Develop

```bash
npm install && npm run compile
# F5 in VS Code
```

## License

MIT
