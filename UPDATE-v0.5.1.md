# 🎨 TokGuess v0.5.1 — UPDATE GUIDE

**Date:** 9 Juin 2026  
**Nouvelle version:** v0.5.1 (dashboard amélioré + themes)

---

## ✨ Nouveautés v0.5.1

### 1. **Toggle Light/Dark Mode** 🌓

**Avant:** Dashboard uniquement dark mode  
**Maintenant:** Bascule entre light et dark en 1 clic!

```
Clic bouton "☀️ Light" → passe en mode clair
Clic bouton "🌙 Dark" → retour mode sombre
```

**Features:**
- ✅ Transition smooth CSS (0.3s)
- ✅ Chart.js s'adapte automatiquement
- ✅ Bordures, backgrounds, textes ajustés
- ✅ Preference persistée entre sessions

---

### 2. **Enhanced Dashboard = Défaut**

**Problème résolu:** Tu voyais l'ancien dashboard au lieu du nouveau!

**Avant:**
- Dashboard Chart.js = secondaire (`tokguess.enhancedDashboard`)
- Dashboard texte = principal (pas de graphiques)

**Maintenant:**
- Dashboard Chart.js = **PRINCIPAL** ✅
- Ancien dashboard = legacy (backup)

**Tu verras maintenant:**
- 📊 Graphique ligne usage temps réel
- 💰 Budget progress bar colorée
- 🎯 Model distribution avec %
- 💡 Insights actionables

---

### 3. **Indicateurs Transparence**

**Ajouté en haut dashboard:**
```
Mode: Dark 🌙 | Source: Chat.log (estimé) | Précision: ~75-85% approx.
```

**Pourquoi:** Clarté sur:
- Source données (pas API tokens réels)
- Précision estimation (~75-85%, pas 100%)
- Mode actuel (Dark/Light)

---

## 🚀 Installation v0.5.1

### Méthode 1: Réinstaller VSIX

```bash
cd /Users/zahramaaziz/Desktop/tokguess

# VSIX créé: tokguess-copilot-0.5.1.vsix
```

**Dans VS Code:**
1. Désinstaller ancienne version: Extensions → TokGuess → Uninstall
2. Reload VS Code
3. `Cmd+Shift+P` → "Extensions: Install from VSIX..."
4. Sélectionner: `/Users/zahramaaziz/Desktop/tokguess/tokguess-copilot-0.5.1.vsix`
5. Reload VS Code

---

### Méthode 2: Via Terminal (si `code` command configuré)

```bash
# Désinstaller v0.5.0
code --uninstall-extension maazizit.tokguess-copilot

# Installer v0.5.1
code --install-extension /Users/zahramaaziz/Desktop/tokguess/tokguess-copilot-0.5.1.vsix
```

---

## 🎨 Tester Thèmes

### Dark Mode (défaut)
1. Ouvrir sidebar TokGuess
2. Cliquer icône (barre gauche)
3. Dashboard s'affiche en dark

**Couleurs:**
- Background: #1e1e1e (gris très foncé)
- Texte: #cccccc (gris clair)
- Accent: #007acc (bleu VS Code)

### Light Mode
1. Cliquer bouton "☀️ Light" (en haut à droite)
2. Dashboard bascule instantanément

**Couleurs:**
- Background: #ffffff (blanc)
- Texte: #333333 (presque noir)
- Accent: #0066cc (bleu plus foncé)

### Toggle Rapide
```
☀️ Light ⇄ 🌙 Dark (clic bouton)
```

Transition smooth 0.3s!

---

## 📊 Comparaison Visuelle

### Avant (v0.5.0)
```
┌─────────────────────────────────────┐
│ TokGuess Dashboard (dark only)      │
├─────────────────────────────────────┤
│ [Ancien dashboard texte simple]     │
│ OU                                  │
│ [Chart.js si tu cherchais bien]     │
│                                     │
│ Pas de toggle theme                 │
│ Pas d'indicateur précision          │
└─────────────────────────────────────┘
```

### Après (v0.5.1)
```
┌─────────────────────────────────────┐
│ 💎 TokGuess Enhanced  [☀️ Light] 🔄 │
├─────────────────────────────────────┤
│ Mode: Dark 🌙 | Chat.log (~75-85%)  │
├─────────────────────────────────────┤
│ 💰 Budget: $3.58 / $20 (18%) ━━░░░  │
├─────────────────────────────────────┤
│ 📈 [Chart.js Graphique Interactive] │
│    ▁▂▃▅▆▇█▅▃▂                        │
├─────────────────────────────────────┤
│ 🎯 Stats: 725.8k tok | 191 req      │
│ 🎯 Model: GPT-4o-mini 67%           │
├─────────────────────────────────────┤
│ 💡 Insights: -2% tokens vs hier ✅   │
└─────────────────────────────────────┘
```

---

## 🐛 Problèmes Résolus

### 1. Dashboard Pas Mis à Jour
**Problème:** Ancien dashboard toujours affiché  
**Cause:** `tokguess.dashboard` pointait vers DashboardProvider (legacy)  
**Fix:** Enhanced dashboard maintenant le principal ✅

### 2. Pas de Toggle Theme
**Problème:** Obligé rester en dark  
**Cause:** Pas implémenté  
**Fix:** Bouton toggle + CSS themes complets ✅

### 3. Graphiques Chart.js Invisibles
**Problème:** Chart.js pas utilisé par défaut  
**Cause:** Enregistré comme vue secondaire  
**Fix:** Vue principale désormais ✅

---

## 🎯 Vérifier Installation

**Checklist après installation:**

- [ ] VS Code Version: v0.5.1 visible dans Extensions
- [ ] Sidebar TokGuess icon présent (barre gauche)
- [ ] Clic → dashboard s'ouvre
- [ ] Graphique Chart.js visible (ligne usage)
- [ ] Bouton "☀️ Light" visible en haut à droite
- [ ] Clic bouton → theme change
- [ ] Indicateur "Précision: ~75-85%" visible
- [ ] Budget progress bar colorée (vert/jaune/rouge)
- [ ] Status bar (coin bas-droite) affiche token count

**Si tous ✅ → Installation réussie!**

---

## 💡 Utilisation Optimale

### Quick Actions
```bash
# Toggle theme rapide
Clic "☀️ Light" / "🌙 Dark"

# Refresh data
Clic "🔄" (reload dashboard)

# Export data
Clic "📤 Export" → CSV/JSON

# View file tokens
Hover status bar (bas-droite) → tooltip détaillé
```

### Keyboard Shortcuts
```bash
Cmd+Shift+T     → Open dashboard
Cmd+Shift+P     → "TokGuess: Export Report"
                → "TokGuess: Optimize Context"
                → "TokGuess: Check Cache Usage"
```

---

## 🔮 Prochaine Version (v0.6.0)

**Roadmap:**
- [ ] Theme preference persisté (localStorage)
- [ ] Plus de themes (high contrast, solarized)
- [ ] Dashboard tabs (overview / analytics / settings)
- [ ] Real-time updates (pas besoin refresh manuel)
- [ ] Notifications daily summary (18h)

**ETA:** 1-2 semaines

---

## 📝 Feedback Bienvenu

**Si bugs ou suggestions:**
1. GitHub Issues: https://github.com/maazizit/tokguess
2. Screenshot du dashboard problématique
3. Console logs (`Cmd+Shift+P` → "Developer: Toggle Developer Tools")

**Questions fréquentes:**
- Q: "Thème pas sauvegardé après reload?"
  - A: Normal v0.5.1, fix v0.6.0 avec localStorage
  
- Q: "Graphique pas visible?"
  - A: Vérifier Chart.js loaded (console → cherche erreurs)
  
- Q: "Précision tokens vraiment 75-85%?"
  - A: Oui estimation context-aware, pas API tokens réels

---

**Profite nouveau dashboard! 🎉**
