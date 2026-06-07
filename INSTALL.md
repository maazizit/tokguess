# TokGuess — Installation

## Dev mode (F5)

1. Clone the repo
2. `npm install && npm run compile`
3. Open in VS Code, press **F5**

## VSIX (recommended for daily use)

```bash
npm install
npm run compile
npx @vscode/vsce package
```

In VS Code:

1. `Ctrl+Shift+X` (Extensions)
2. `...` menu → **Install from VSIX**
3. Select `tokguess-copilot-0.1.0.vsix`

## Requirements

- VS Code ≥ 1.80
- GitHub Copilot (optional — TokGuess works on any open file)

## Uninstall

Extensions → TokGuess for Copilot → Uninstall
