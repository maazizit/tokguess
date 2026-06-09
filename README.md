# TokGuess

Track **real** AI token usage from local session logs — plus file estimates before you send. 100% local, zero cloud.

## How it works

```text
Copilot           → VS Code logs (ccreq patterns)                     → ~75-85% estimated
Copilot (legacy)  → ~/.copilot/session-state/*/events.jsonl      → real tokens (rare)
Claude            → ~/.claude/projects/**/*.jsonl                 → real tokens
Antigravity CLI   → ~/.gemini/antigravity-cli/brain/*/transcript → real or ~estim
Editor            → chars ÷ 4.2                                    → ~90-95% estim
```

| Layer | Source | Accuracy | Status |
|-------|--------|----------|--------|
| **Copilot Log Watcher** | VS Code `GitHub Copilot Chat.log` (ccreq) | **~75-85%** context-aware estimation | ✅ **Active** |
| **Copilot Watcher** | `~/.copilot/session-state/events.jsonl` | Real API tokens | ⚠️ Rare (disabled by default) |
| **Claude Watcher** | Claude Desktop `*.jsonl` (`message.usage`) | Real API tokens | ✅ Active if installed |
| **Antigravity Watcher** | Google Gemini CLI `transcript.jsonl` | Real or content estimate | ✅ Active if installed (Note: **Gemini CLI deprecated 18/06/2026**, Antigravity CLI is new standard) |
| **File Estimator** | Open file in editor | ~90–95% approx. | ✅ Always active |

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
| `tokguess.sources.antigravity.enabled` | `true` |
| `tokguess.sources.copilot.path` | `~/.copilot/session-state` |
| `tokguess.sources.claude.path` | `~/.claude/projects` |
| `tokguess.sources.antigravity.path` | `~/.gemini/antigravity-cli/brain` |
| `tokguess.budget.monthly_cost_usd` | `20` |
| `tokguess.budget.daily_tokens` | `50000` |
| `tokguess.budget.per_file_tokens` | `5000` |

## Estimation Accuracy

### Copilot (Improved June 2026)

**TokGuess now uses context-aware estimation for Copilot** since `events.jsonl` is rarely available:

- ✅ **Panel/Edit Agent**: 4k base input, 10:1 ratio → ~75-85% accuracy
- ✅ **Autocomplete**: 1k base input, 12:1 ratio → ~80-90% accuracy  
- ✅ **Chat**: 2k base input, 5:1 ratio → ~75-85% accuracy
- ✅ **Real model rates**: GPT-4o-mini (165 tok/s), Claude Sonnet 4.5 (120 tok/s)
- ✅ **Network latency subtracted**: 150-300ms depending on model

**Previous formula**: Fixed 5:1 ratio, generic rates → ~35-45% accuracy ❌  
**New formula**: Context profiles + real benchmarks → **~75-85% accuracy** ✅

See [AMÉLIORATION-ESTIMATION.md](AMÉLIORATION-ESTIMATION.md) for technical details.

### Other Sources

- **Claude Desktop**: Real API tokens from `message.usage` → **100% accurate** ✅
- **Antigravity CLI**: Real tokens from `usage`/`token_usage` fields, or content estimation → **95-100%** ✅
- **File Estimator**: Character count ÷ 4.2 → **~90-95%** ✅

## Disclaimer

- **Copilot tokens** = context-aware estimation (~75-85%), not official billing
- **Claude/Antigravity tokens** = real counts from local logs when available
- **Context Budget** = local file estimate (~90–95%), not official billing
- **Cost** = public API rates (approx.)

## Develop

```bash
npm install && npm run compile
# F5 in VS Code
```

## License

MIT
