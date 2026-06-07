# TokGuess — Quick start (5 min)

## 1. Install deps

```bash
cd tokguess
npm install
```

## 2. Compile

```bash
npm run compile
```

## 3. Run in VS Code

```bash
code .
```

Press **F5** → Extension Development Host opens.

## 4. Test

1. Open any file with code
2. Check status bar: `🤖 ~XXX tok`
3. Press **Ctrl+Shift+T** for stats popup

## Package as VSIX

```bash
npm install -g @vscode/vsce
npm run package
# Install: Extensions → ... → Install from VSIX
```
