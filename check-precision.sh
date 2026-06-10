#!/bin/bash
# TokGuess - Diagnostic Mode Précision
# Vérifie si le mode précision est actif et fonctionnel

echo "🔍 TokGuess - Diagnostic Mode Précision"
echo "========================================"
echo ""

# 1. Vérifier les paramètres VS Code
echo "1️⃣  Paramètres VS Code (Copilot OTel)"
echo "-----------------------------------"
VSCODE_SETTINGS="$HOME/Library/Application Support/Code/User/settings.json"
if [ -f "$VSCODE_SETTINGS" ]; then
  echo "✅ Fichier settings.json trouvé"
  
  # Vérifier les clés OTel
  if grep -q "github.copilot.chat.otel" "$VSCODE_SETTINGS"; then
    echo "✅ Paramètres OTel trouvés:"
    grep "github.copilot.chat.otel" "$VSCODE_SETTINGS" | sed 's/^/   /'
  else
    echo "❌ Aucun paramètre OTel configuré"
    echo "   → Mode précision probablement désactivé"
  fi
else
  echo "❌ Fichier settings.json introuvable"
fi
echo ""

# 2. Vérifier le collecteur local (ports)
echo "2️⃣  Collecteur Local (localhost)"
echo "----------------------------"
if lsof -i :4318 >/dev/null 2>&1; then
  echo "✅ Port 4318 (OTLP) actif:"
  lsof -i :4318 | tail -n +2 | sed 's/^/   /'
else
  echo "❌ Port 4318 (OTLP) fermé"
fi

if lsof -i :4319 >/dev/null 2>&1; then
  echo "✅ Port 4319 (API) actif:"
  lsof -i :4319 | tail -n +2 | sed 's/^/   /'
else
  echo "❌ Port 4319 (API) fermé"
fi
echo ""

# 3. Tester la santé du collecteur
echo "3️⃣  Health Check API"
echo "------------------"
if curl -s --max-time 2 http://127.0.0.1:4319/health >/dev/null 2>&1; then
  HEALTH=$(curl -s http://127.0.0.1:4319/health)
  echo "✅ API répond:"
  echo "   $HEALTH"
else
  echo "❌ API ne répond pas (timeout ou connexion refusée)"
  echo "   → Le collecteur n'est pas démarré"
fi
echo ""

# 4. Vérifier le fichier OTel de Copilot
echo "4️⃣  Fichier OTel Copilot"
echo "---------------------"
OTEL_FILE="$HOME/Library/Application Support/Code/User/globalStorage/github.copilot-chat/copilot-otel.jsonl"
if [ -f "$OTEL_FILE" ]; then
  echo "✅ Fichier trouvé: $OTEL_FILE"
  FILE_SIZE=$(stat -f%z "$OTEL_FILE" 2>/dev/null || echo "0")
  echo "   Taille: $FILE_SIZE octets"
  
  # Vérifier la dernière modification
  MOD_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$OTEL_FILE" 2>/dev/null || echo "inconnu")
  echo "   Modifié: $MOD_TIME"
  
  # Afficher les dernières lignes si le fichier existe et n'est pas vide
  if [ "$FILE_SIZE" -gt 0 ]; then
    echo "   Dernières entrées:"
    tail -n 2 "$OTEL_FILE" 2>/dev/null | sed 's/^/   /'
  fi
else
  echo "❌ Fichier inexistant: $OTEL_FILE"
  echo "   → Copilot n'exporte pas de télémétrie"
fi
echo ""

# 5. Vérifier les extensions Copilot installées
echo "5️⃣  Extensions VS Code"
echo "--------------------"
CODE_BIN=$(which code)
if [ -n "$CODE_BIN" ]; then
  echo "Extensions Copilot installées:"
  code --list-extensions --show-versions 2>/dev/null | grep -i copilot | sed 's/^/   /' || echo "   ❌ Aucune extension Copilot trouvée"
  
  echo ""
  echo "Extension TokGuess:"
  code --list-extensions --show-versions 2>/dev/null | grep -i tokguess | sed 's/^/   /' || echo "   ❌ TokGuess non installé"
else
  echo "❌ Commande 'code' introuvable"
  echo "   → Impossible de vérifier les extensions"
fi
echo ""

# 6. Résumé et diagnostic
echo "📊 RÉSUMÉ"
echo "========="

HAS_SETTINGS=$(grep -q "github.copilot.chat.otel" "$VSCODE_SETTINGS" 2>/dev/null && echo "1" || echo "0")
HAS_PORT=$(lsof -i :4318 >/dev/null 2>&1 && echo "1" || echo "0")
HAS_API=$(curl -s --max-time 2 http://127.0.0.1:4319/health >/dev/null 2>&1 && echo "1" || echo "0")
HAS_FILE=$([ -f "$OTEL_FILE" ] && echo "1" || echo "0")

if [ "$HAS_SETTINGS" = "1" ] && [ "$HAS_PORT" = "1" ] && [ "$HAS_API" = "1" ]; then
  echo "✅ Mode précision ACTIF et FONCTIONNEL"
  echo ""
  echo "📝 Utilise Copilot Chat pour voir les tokens réels dans le dashboard"
elif [ "$HAS_SETTINGS" = "1" ]; then
  echo "⚠️  Mode précision ACTIVÉ mais collecteur ARRÊTÉ"
  echo ""
  echo "🔧 Actions:"
  echo "   1. Ouvre le dashboard TokGuess dans VS Code"
  echo "   2. Clique sur '🎯 Plus de précision'"
  echo "   3. Suis l'assistant pour redémarrer le collecteur"
else
  echo "❌ Mode précision DÉSACTIVÉ"
  echo ""
  echo "🔧 Pour activer:"
  echo "   1. Ouvre VS Code"
  echo "   2. Commande: 'TokGuess: Enable Precision Mode'"
  echo "   3. OU ouvre le dashboard → '🎯 Plus de précision'"
fi
echo ""

# 7. Commandes utiles
echo "💡 COMMANDES UTILES"
echo "==================="
echo "# Voir les processus Node.js (collecteur):"
echo "ps aux | grep -i node | grep -v grep"
echo ""
echo "# Tester l'API manuellement:"
echo "curl http://127.0.0.1:4319/health"
echo "curl http://127.0.0.1:4319/spans"
echo ""
echo "# Suivre le fichier OTel en temps réel:"
echo "tail -f \"$OTEL_FILE\""
echo ""
echo "# Redémarrer VS Code:"
echo "killall 'Code' && code"
