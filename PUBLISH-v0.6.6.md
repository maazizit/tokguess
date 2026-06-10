# 🚀 Publication TokGuess v0.6.6

**Date:** 2026-06-10  
**Version:** 0.6.6  
**Package:** `tokguess-copilot-0.6.6.vsix` (4.84 MB)

## ✅ Checklist Pré-Publication

- [x] Version incrémentée (0.6.5 → 0.6.6)
- [x] CHANGELOG.md mis à jour
- [x] Code compilé sans erreurs
- [x] Package .vsix créé avec succès
- [x] Fichiers inclus vérifiés

## 🆕 Nouveautés v0.6.6

### 🌐 Page Web du Collecteur Local
- **http://localhost:4319** affiche maintenant une belle interface:
  - Statut en temps réel (spans collectés)
  - Documentation des endpoints API
  - Lien direct pour tester `/health`
  - Instructions d'utilisation
- Design dark mode assorti à VS Code
- Plus de 404 sur la page d'accueil!

### 🔍 Script de Diagnostic
- **check-precision.sh** - outil de diagnostic complet:
  - Vérifie les paramètres VS Code OTel
  - Teste les ports 4318 (OTLP) et 4319 (API)
  - Vérifie le fichier copilot-otel.jsonl
  - Affiche les extensions installées
  - Donne un résumé avec recommandations
- Aide les utilisateurs à troubleshooter le mode précision

## 📦 Commandes de Publication

### Option 1: Publier sur Marketplace

```bash
# Publier avec vsce
vsce publish

# OU publier en spécifiant la version
vsce publish 0.6.6

# Avec un message
vsce publish -m "Add collector status page and diagnostic tools"
```

### Option 2: Installation Locale (Test)

```bash
# Installer le .vsix localement pour tester
code --install-extension tokguess-copilot-0.6.6.vsix

# OU via VS Code UI:
# Extensions → "..." → Install from VSIX
```

### Option 3: GitHub Release

```bash
# 1. Créer un tag Git
git tag v0.6.6
git push origin v0.6.6

# 2. Créer une release sur GitHub
# Attacher: tokguess-copilot-0.6.6.vsix

# 3. Notes de release:
```

## 📝 Notes de Release GitHub

```markdown
## TokGuess v0.6.6 - Collector UI & Diagnostics

### 🌐 New Collector Status Page
Visit **http://localhost:4319** when precision mode is active to see:
- ✅ Real-time collector status and span count
- ✅ API endpoints documentation  
- ✅ Interactive health check
- ✅ Beautiful dark-themed UI

No more 404! The collector now has a proper web interface.

### 🔍 Diagnostic Script
New **check-precision.sh** helps troubleshoot precision mode:
```bash
./check-precision.sh
```

Checks OTel settings, ports, file exports, and provides actionable recommendations.

### 📦 Installation
```bash
code --install-extension tokguess-copilot-0.6.6.vsix
```

Or download from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot)

---

**Full Changelog:** [CHANGELOG.md](CHANGELOG.md)
```

## 🧪 Tests Recommandés

Avant publication, tester:

1. **Installation fraîche:**
   ```bash
   code --install-extension tokguess-copilot-0.6.6.vsix
   ```

2. **Activer le mode précision:**
   - Ouvrir le dashboard TokGuess
   - Cliquer "🎯 Precision"
   - Suivre le wizard

3. **Vérifier localhost:**
   - Ouvrir http://localhost:4319
   - Vérifier que la page s'affiche
   - Tester le lien /health

4. **Exécuter le diagnostic:**
   ```bash
   ./check-precision.sh
   ```

5. **Utiliser Copilot Chat:**
   - Vérifier que les tokens apparaissent dans le dashboard
   - Vérifier le fichier ~/.tokguess/copilot-otel.jsonl

## 🎯 Post-Publication

### Marketplace
- [ ] Vérifier la page de l'extension
- [ ] Tester l'installation depuis le marketplace
- [ ] Mettre à jour le README si nécessaire

### Communication
- [ ] Annoncer sur Twitter/X
- [ ] Post sur Reddit (r/vscode, r/programming)
- [ ] Mettre à jour la documentation

### Monitoring
- [ ] Surveiller les issues GitHub
- [ ] Répondre aux reviews sur le marketplace
- [ ] Préparer v0.6.7 si bugs critiques

## 📊 Métriques à Surveiller

- Nombre de téléchargements
- Évaluations / reviews
- Issues GitHub
- Temps de réponse pour les bugs

## ⚡ Publier Maintenant

```bash
# Publier sur VS Code Marketplace
vsce publish

# Vérifier la publication
open https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot
```

---

**Prêt pour publication! 🚀**
