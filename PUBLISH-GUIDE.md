# 🚀 Publication TokGuess sur VS Code Marketplace

**Version:** 0.5.1  
**Date:** 9 Juin 2026  
**Status:** ✅ Prêt pour publication

---

## ✅ Checklist Pré-Publication (COMPLET)

### Fichiers Requis
- [x] **package.json** — Configuration complète
- [x] **README.md** — Documentation utilisateur
- [x] **LICENSE** — MIT License créé
- [x] **CHANGELOG.md** — Historique versions
- [x] **icon.png** — Logo 128x128 (media/)
- [x] **Code compilé** — TypeScript → JavaScript (out/)
- [x] **VSIX packagé** — tokguess-copilot-0.5.1.vsix

### Metadata Package.json
- [x] **name:** tokguess-copilot
- [x] **displayName:** TokGuess
- [x] **description:** Complet et clair
- [x] **version:** 0.5.1
- [x] **publisher:** maazizit
- [x] **repository:** GitHub URL
- [x] **license:** MIT
- [x] **keywords:** 11 tags pertinents
- [x] **categories:** Other, Machine Learning
- [x] **icon:** media/icon.png
- [x] **galleryBanner:** Dark theme

### Qualité Code
- [x] **TypeScript:** 0 erreurs compilation
- [x] **Dependencies:** Minimal (Chart.js uniquement)
- [x] **Size:** 109 KB (optimal)
- [x] **VS Code Engine:** ^1.80.0 (compatible)

---

## 🔑 Étape 1: Créer Publisher (Si Pas Déjà Fait)

### A. Créer Personal Access Token (Azure DevOps)

1. **Aller sur:** https://dev.azure.com
2. **Login** avec compte Microsoft
3. **User Settings** (icône profil) → **Personal Access Tokens**
4. **New Token** avec:
   - Name: `vscode-marketplace-tokguess`
   - Organization: **All accessible organizations**
   - Expiration: **1 year**
   - Scopes: **Marketplace** → ☑️ **Manage** (full access)
5. **Create** → **Copier le token** (garde-le secret!)

### B. Créer Publisher VS Code

```bash
# Login avec token
vsce login maazizit

# Entrer token quand demandé
# Token: [coller PAT Azure DevOps]
```

**Si publisher "maazizit" existe déjà:**
```bash
# Vérifier
vsce ls-publishers

# Si pas le tien, choisir autre nom:
# "zahramaaziz" ou "maaziz-dev"
```

**Si besoin créer nouveau publisher:**
```bash
vsce create-publisher zahramaaziz

# Remplir:
# - Name: zahramaaziz
# - Display Name: Zahra Maaziz
# - Personal Access Token: [coller PAT]
```

---

## 📤 Étape 2: Publier Extension

### Option A: Publish Direct

```bash
cd /Users/zahramaaziz/Desktop/tokguess

# Publier (utilise VSIX déjà créé)
vsce publish

# OU spécifier version
vsce publish 0.5.1

# OU publier avec bump version
vsce publish patch  # 0.5.1 → 0.5.2
vsce publish minor  # 0.5.1 → 0.6.0
vsce publish major  # 0.5.1 → 1.0.0
```

**Output attendu:**
```
Executing prepublish script 'npm run vscode:prepublish'...
Publishing maazizit.tokguess-copilot@0.5.1...
✓ https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot
Published maazizit.tokguess-copilot@0.5.1
Your extension will live at: 
https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot 
(might take a few minutes for it to show up)
```

### Option B: Upload VSIX Manuel

Si `vsce publish` échoue:

1. **Aller sur:** https://marketplace.visualstudio.com/manage
2. **Login** avec compte publisher
3. **New Extension** → **Upload**
4. **Select VSIX:** tokguess-copilot-0.5.1.vsix
5. **Submit**

---

## 🎨 Étape 3: Améliorer Page Marketplace (Optionnel)

### A. Ajouter Screenshots

**Créer dossier screenshots:**
```bash
mkdir -p /Users/zahramaaziz/Desktop/tokguess/media/screenshots
```

**Screenshots recommandés:**
1. **Dashboard dark mode** (capture sidebar)
2. **Dashboard light mode** (après toggle)
3. **Status bar** (coin bas-droite avec tooltip)
4. **Context budget alert** (popup warning)
5. **Export dialog** (CSV/JSON options)

**Ajouter dans README:**
```markdown
## Screenshots

### Dashboard with Chart.js
![Dashboard Dark](media/screenshots/dashboard-dark.png)
![Dashboard Light](media/screenshots/dashboard-light.png)

### Context Budget Alert
![Budget Alert](media/screenshots/budget-alert.png)
```

### B. Enrichir README.md

```bash
# Ajouter badges
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/maazizit.tokguess-copilot)](https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/maazizit.tokguess-copilot)](https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/maazizit.tokguess-copilot)](https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot)
```

---

## 🔍 Étape 4: Vérification Post-Publication

### A. Page Marketplace (5-10 min après publish)

**URL:** https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot

**Vérifier:**
- [ ] Logo visible
- [ ] Description complète
- [ ] Screenshots (si ajoutés)
- [ ] README rendu correctement
- [ ] Bouton "Install" fonctionne
- [ ] Version 0.5.1 affichée

### B. Installation Test

```bash
# Désinstaller version locale
code --uninstall-extension maazizit.tokguess-copilot

# Installer depuis Marketplace
code --install-extension maazizit.tokguess-copilot

# OU via VS Code UI:
# Extensions → Rechercher "TokGuess" → Install
```

---

## 📊 Étape 5: Promotion & Marketing

### A. Annonces

**Twitter/LinkedIn:**
```
🚀 Just published TokGuess v0.5.1 on VS Code Marketplace!

Track Copilot/Claude token usage with:
📊 Interactive Chart.js dashboard
🌓 Light/Dark mode toggle
💰 Budget alerts & cost tracking
⚡ Context optimization

Install: https://marketplace.visualstudio.com/items?itemName=maazizit.tokguess-copilot

#VSCode #AI #Copilot #Claude #DevTools
```

**Reddit (r/vscode, r/programming):**
```
Title: [Release] TokGuess - Track AI token usage in VS Code

Body: Track your Copilot/Claude token consumption with real-time 
dashboard, budget alerts, and cost estimation. v0.5.1 adds light/dark 
theme toggle and enhanced Chart.js visualizations.

Free & open-source: https://github.com/maazizit/tokguess
Marketplace: https://marketplace.visualstudio.com/...
```

### B. GitHub Release

```bash
# Tag version
git tag -a v0.5.1 -m "Release v0.5.1 - Theme toggle & enhanced dashboard"
git push origin v0.5.1

# Create GitHub Release
# → Attach: tokguess-copilot-0.5.1.vsix
# → Copy CHANGELOG.md content
```

---

## 🐛 Troubleshooting

### Erreur: "Publisher not found"

```bash
# Créer publisher d'abord
vsce create-publisher maazizit

# OU changer dans package.json:
"publisher": "nouveau-nom"
```

### Erreur: "Invalid token"

```bash
# Re-login avec nouveau PAT
vsce logout
vsce login maazizit
```

### Erreur: "Extension validation failed"

```bash
# Vérifier package.json
vsce ls

# Lister fichiers inclus
vsce ls-files

# Tester packaging
vsce package --no-yarn
```

### Extension pas visible sur Marketplace

**Délai normal:** 5-15 minutes après publish

**Si > 30 min:**
1. Check email notifications Microsoft
2. Vérifier https://marketplace.visualstudio.com/manage
3. Voir logs erreurs

---

## 📈 Métriques à Suivre

**Marketplace Analytics:**
- **Installs:** Nombre installations
- **Downloads:** Téléchargements VSIX
- **Ratings:** Notes utilisateurs
- **Reviews:** Commentaires

**GitHub:**
- **Stars:** ⭐ GitHub repo
- **Issues:** Bugs reportés
- **Forks:** Contributions externes

---

## 🎯 Objectifs v1.0

**Atteindre avant v1.0:**
- [ ] 100+ installations
- [ ] 4+ ⭐ rating
- [ ] 5+ reviews positives
- [ ] 0 bugs critiques
- [ ] Documentation complète
- [ ] Beta test team validé

**Timeline:** 2-4 semaines après initial release

---

## 🚀 Commande Publication Finale

```bash
cd /Users/zahramaaziz/Desktop/tokguess

# Vérifier tout prêt
npm run compile
npm run package

# Login (si pas déjà fait)
vsce login maazizit

# PUBLIER! 🎉
vsce publish

# Attendre confirmation
# ✓ Published maazizit.tokguess-copilot@0.5.1
```

---

**Prêt à publier?** Lance `vsce publish` quand ready! 🚀
