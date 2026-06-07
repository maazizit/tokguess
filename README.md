# TokGuess for Copilot

Local **token estimates** for GitHub Copilot Chat in VS Code.

> **Not official Microsoft billing.** TokGuess approximates GPT-4 tokenization from the text you see in the editor (~90–95% accuracy). Copilot does not expose real token counts to extensions.

## Features

- **100% local** — no network, no tracking, zero runtime dependencies
- **Real-time status bar** — `🤖 ~450 tok`
- **Copilot-calibrated formula** — `chars ÷ 4.2` + code boost (+8%)
- **Shortcut** — `Ctrl+Shift+T` for detailed stats

## Quick start

```bash
npm install
npm run compile
code .
# Press F5 to launch Extension Development Host
```

## Usage

| Action | How |
|--------|-----|
| Live estimate | Status bar (bottom right) |
| Detailed stats | Click status bar or `Ctrl+Shift+T` |
| Toggle on/off | Command Palette → `TokGuess: Toggle` |

## Formula

```
tokens ≈ (chars ÷ 4.2) + punctuation bonus + code boost (×1.08)
```

Calibrated for GPT-4 / Copilot Chat tokenizer behavior.

## What it does not do

- Does not read Copilot's internal API or billing
- Does not count system prompts or injected context
- Does not show response tokens in real time

For agent-session savings (shell compression, response tracking), use [TokViz](https://github.com/maazizit/tokviz).

## Roadmap

- [ ] Claude mode (Anthropic tokenizer)
- [ ] Cursor mode (hook integration)
- [ ] Optional `tiktoken` for higher precision

## License

MIT
