#!/bin/zsh
# fix-copilot-otel.sh — À lancer APRÈS la mise à jour de VS Code ≥ 1.120
# Usage : zsh fix-copilot-otel.sh

CODE="/Applications/Visual Studio Code 2.app/Contents/Resources/app/bin/code"

echo "=== 1. Version VS Code ==="
"$CODE" --version

echo ""
echo "=== 2. Installation/mise à jour GitHub.copilot-chat ==="
"$CODE" --install-extension GitHub.copilot-chat --force

echo ""
echo "=== 3. Version copilot-chat chargée ==="
"$CODE" --list-extensions --show-versions | grep -i copilot

echo ""
echo "=== 4. Retrait 0.48.1 de .obsolete (sécurité) ==="
python3 - <<'PY'
import json, os
path = os.path.expanduser('~/.vscode/extensions/.obsolete')
with open(path) as f:
    obs = json.load(f)
removed = obs.pop('github.copilot-chat-0.48.1', None)
with open(path, 'w') as f:
    json.dump(obs, f)
print("0.48.1 retiré de .obsolete ✓" if removed is not None else "0.48.1 déjà absent de .obsolete ✓")
PY

echo ""
echo "=== 5. État fichier OTEL (après reload VS Code) ==="
echo "Relance VS Code, attends 30 secondes, puis exécute :"
echo "  wc -l ~/.tokguess/copilot-otel.jsonl"
echo ""
echo "Attendu : > 0 lignes après la première requête Copilot Chat."
echo ""
echo "=== En attendant : désactive Precision Mode dans TokGuess ==="
echo "Cmd+Shift+P → 'TokGuess: Disable Precision'"
echo "→ retour estimation Chat.log (les nouvelles requêtes Copilot seront visibles)"
