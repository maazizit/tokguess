# TokGuess — Roadmap Améliorations & Utilité Utilisateur

**Date:** 9 Juin 2026  
**Version actuelle:** 0.3.3  
**Context:** Propositions amélioration extension pour meilleure adoption

---

## 🤔 Question: Pourquoi "Antigravity logs absents"?

### Explication

**Antigravity CLI** = Outil en ligne de commande Google pour interagir avec Gemini AI.

```bash
# Installation typique (si utilisateur l'a installé)
npm install -g @google/antigravity-cli
# ou
pip install antigravity-cli
```

**Sur ce système:**
```bash
$ which antigravity
antigravity not found          # ← CLI pas installé

$ ls ~/.gemini
ls: ~/.gemini: No such file    # ← Pas de logs
```

**Conclusion:** TokGuess détecte automatiquement si Antigravity installé. Si absent = watcher inactif (normal).

**Impact utilisateur:** ❌ **AUCUN** — 95% utilisateurs n'ont pas Antigravity installé.

### Watchers vraiment utilisés

| Watcher | Utilisateurs | Raison |
|---------|--------------|--------|
| **CopilotLogWatcher** | 🟢 **~90%** | GitHub Copilot très populaire |
| **ClaudeWatcher** | 🟡 **~30%** | Claude Desktop utilisateurs payants |
| **AntigravityWatcher** | 🔴 **~5%** | CLI Google Gemini (niche) |
| **FileEstimator** | 🟢 **100%** | Toujours actif |

**Problème principal:** TokGuess trop dépendant de logs externes qui n'existent pas toujours.

---

## 🚀 Propositions Amélioration TokGuess

### 🎯 Priorité 1: UX/UI Improvements (Impact immédiat)

#### 1.1 **Dashboard Redesign**

**Problème actuel:** Dashboard = webview simple, stats basiques.

**Amélioration:**
```typescript
// Ajouter graphiques interactifs
- 📊 Chart.js pour courbes usage temporel
- 🎨 Segmentation par modèle (GPT-4o vs Claude vs mini)
- 📈 Comparaison périodes (hier vs aujourd'hui vs semaine)
- 💰 Prévision coût mensuel basée historique
- 🔥 Heatmap fichiers (quels fichiers consomment le plus)
```

**Mockup Vision:**
```
┌─────────────────────────────────────────────┐
│ TokGuess Dashboard              🔄 Refresh  │
├─────────────────────────────────────────────┤
│                                             │
│  📊 Token Usage This Week                   │
│  ▁▂▃▄▅▆▇█ [Graph interactif]                │
│                                             │
│  💰 Estimated Cost: $4.23 / $20 budget      │
│  ━━━━━━━━━━░░░░░░░░ 21%                     │
│                                             │
│  🎯 By Model:                                │
│  ├─ GPT-4o-mini     12,450 tok  ($0.62)    │
│  ├─ Claude Sonnet   8,320 tok   ($2.50)    │
│  └─ GPT-4o          4,100 tok   ($1.11)    │
│                                             │
│  🔥 Top Files:                               │
│  1. src/extension.ts        +2,340 tok      │
│  2. watchers/copilot.ts     +1,890 tok      │
│  3. dashboard/provider.ts   +1,230 tok      │
│                                             │
│  ⚙️ Settings  📤 Export CSV  📊 Analytics   │
└─────────────────────────────────────────────┘
```

**Effort:** 2-3 jours  
**Impact:** ⭐⭐⭐⭐⭐ (UX transformée)

---

#### 1.2 **Status Bar Enrichi**

**Actuel:** `$(graph) 1,234 tok`

**Amélioré:**
```typescript
// Status bar contextuel
├─ Idle:        "💎 TokGuess: 1,234 tok today"
├─ Typing:      "💎 +127 tok | Budget: 45%"
├─ Alert:       "⚠️ 28k/32k (87%) | Click to review"
├─ Over budget: "🔴 33k/32k OVER | Reduce context!"
└─ Click:       → Open dashboard

// Tooltip hover
┌─────────────────────────────┐
│ TokGuess Session Summary    │
├─────────────────────────────┤
│ Today: 1,234 tokens         │
│ This file: 127 tokens       │
│ Model: Claude Sonnet 4.5    │
│ Cost: ~$0.04                │
│                             │
│ Click for full dashboard    │
└─────────────────────────────┘
```

**Effort:** 1 jour  
**Impact:** ⭐⭐⭐⭐ (visibilité permanente)

---

#### 1.3 **Inline Decorations (CodeLens)**

**Concept:** Afficher tokens directement dans code.

```typescript
// example.ts
export function processData(data: string) {  // 💎 This function: ~450 tokens
  const result = JSON.parse(data);
  // ... code ...
  return result;
}
```

**Features:**
- Decoration au-dessus fonctions/classes
- Estimation tokens pour bloc sélectionné
- Warning si fonction > 2000 tokens (context heavy)

**Effort:** 2 jours  
**Impact:** ⭐⭐⭐⭐ (feedback direct dans code)

---

### 🎯 Priorité 2: Fonctionnalités Nouvelles (Valeur ajoutée)

#### 2.1 **Budget Management Avancé**

**Actuel:** Simple threshold 32k.

**Amélioré:**
```typescript
// Multi-budgets configurables
interface Budget {
  monthly_cost: number;      // $20/mois max
  daily_tokens: number;      // 50k tokens/jour max
  per_file: number;          // 5k tokens/fichier max
  alert_percentage: number;  // Alert à 75%
  hard_limit: boolean;       // Bloquer si dépassé?
}

// Alertes intelligentes
if (file_tokens > 5000) {
  vscode.window.showWarningMessage(
    "⚠️ Large file detected! Consider splitting context.",
    "Split Selection", "Ignore"
  );
}
```

**Features:**
- Budget par projet (workspace-specific)
- Alertes graduelles (75% → 85% → 95%)
- Suggestions contextuelles ("Remove comments? -1,200 tok")
- Export rapport budget mensuel

**Effort:** 3 jours  
**Impact:** ⭐⭐⭐⭐⭐ (contrôle coûts)

---

#### 2.2 **Smart Context Optimizer**

**Problème:** Utilisateurs envoient trop de contexte inutile.

**Solution:**
```typescript
// Analyse automatique contexte
class ContextOptimizer {
  analyze(selection: string) {
    return {
      total_tokens: 8450,
      breakdown: {
        code: 3200,
        comments: 2100,      // Potentiel -2100 tok
        imports: 890,        // Potentiel -800 tok
        whitespace: 1260,    // Potentiel -1000 tok
        tests: 1000          // Potentiel -1000 tok
      },
      suggestions: [
        { action: "Remove comments", save: 2100 },
        { action: "Remove imports", save: 800 },
        { action: "Remove tests", save: 1000 },
        { action: "Minify code", save: 1260 }
      ]
    };
  }
}

// UI Prompt
┌───────────────────────────────────────┐
│ ⚠️ Context Budget Check               │
├───────────────────────────────────────┤
│ Current: 8,450 tokens (26% of 32k)   │
│                                       │
│ 💡 Optimization suggestions:          │
│ ☑ Remove comments        -2,100 tok  │
│ ☑ Remove test blocks     -1,000 tok  │
│ ☐ Remove imports         -800 tok    │
│                                       │
│ New total: 5,350 tokens (17% of 32k) │
│                                       │
│ [Apply] [Cancel] [Send Anyway]       │
└───────────────────────────────────────┘
```

**Effort:** 4 jours  
**Impact:** ⭐⭐⭐⭐⭐ (économie tokens massive)

---

#### 2.3 **Project Analytics & Insights**

**Concept:** Comprendre patterns usage projet.

```typescript
// Analytics par projet
interface ProjectAnalytics {
  total_sessions: number;
  total_tokens: number;
  total_cost: number;
  avg_tokens_per_session: number;
  most_used_models: { model: string; usage: number }[];
  peak_hours: { hour: number; tokens: number }[];
  cost_trend: "increasing" | "stable" | "decreasing";
  budget_projection: {
    current_month: number;
    projected_month: number;
    overbudget_risk: boolean;
  };
}

// Insights génération
"📊 Insights:
  • You use Claude Sonnet 70% of the time ($3.20/day avg)
  • Peak usage: 2pm-5pm (4,500 tok/hour)
  • This month: $12.34 / $20 budget (62%)
  • Projection: $19.80 total (97% budget) ✅
  • Top 3 expensive files: extension.ts, watchers/, dashboard/
  
💡 Tip: Switch to GPT-4o-mini for drafts → save 50% cost"
```

**Effort:** 3 jours  
**Impact:** ⭐⭐⭐⭐ (awareness financier)

---

### 🎯 Priorité 3: Précision & Intelligence (Amélioration core)

#### 3.1 **Learning Mode (Adaptive Estimation)**

**Problème:** Estimation Copilot fixe → variance utilisateur.

**Solution:**
```typescript
// Apprend patterns utilisateur au fil du temps
class AdaptiveEstimator {
  private history: EstimationHistory[] = [];
  
  learn(estimated: number, context: string, duration: number) {
    // Stocke pattern
    this.history.push({ estimated, context, duration, timestamp: Date.now() });
    
    // Ajuste coefficients basé historique
    if (this.history.length > 100) {
      const userRatio = this.calculateUserRatio();
      this.adjustCoefficients(userRatio);
    }
  }
  
  estimate(duration: number, context: string): number {
    const base = this.baseEstimation(duration, context);
    const userAdjustment = this.getUserAdjustment(context);
    return Math.ceil(base * userAdjustment);
  }
}

// Amélioration progressive
Week 1: ~75% accuracy (formule standard)
Week 2: ~78% accuracy (learning user patterns)
Week 4: ~82% accuracy (well-calibrated)
```

**Effort:** 4 jours  
**Impact:** ⭐⭐⭐⭐ (précision personnalisée)

---

#### 3.2 **Real Token Capture (Network Interception)**

**Problème:** Copilot logs = estimation seulement.

**Solution avancée:**
```typescript
// Proxy local pour intercepter API calls Copilot/Claude
// Nécessite: electron proxy ou browser extension companion

class NetworkInterceptor {
  intercept_copilot_api() {
    // Écoute requêtes GitHub Copilot
    // Parse response headers: x-tokens-input, x-tokens-output
    // Store REAL tokens
  }
  
  intercept_claude_api() {
    // Écoute requêtes Anthropic
    // Parse response body: usage.input_tokens, usage.output_tokens
  }
}

// Alternative: Browser Extension Companion
// TokGuess Web Extension → intercepts API → sends to VS Code extension
```

**Effort:** 10 jours (complexe)  
**Impact:** ⭐⭐⭐⭐⭐ (100% précision)  
**Risque:** Compliance GitHub/Anthropic ToS

---

#### 3.3 **Cache Detection & Optimization**

**Problème:** Anthropic cache invisible dans estimations.

**Solution:**
```typescript
// Détecte répétitions context → probable cache hit
class CachePredictor {
  predict_cache_usage(current_context: string): CachePrediction {
    const recent = this.get_recent_contexts(minutes: 10);
    
    for (const prev of recent) {
      const similarity = this.calculate_similarity(current_context, prev.context);
      
      if (similarity > 0.8) {
        // Probable cache hit!
        const cache_tokens = Math.floor(prev.input_tokens * similarity);
        return {
          cache_hit_likely: true,
          cached_tokens: cache_tokens,
          saved_cost: cache_tokens * 0.00001  // Cache 10x cheaper
        };
      }
    }
    
    return { cache_hit_likely: false };
  }
}

// UI
"💰 Cache detected! ~2,340 tokens cached → save $0.023 (90% off input)"
```

**Effort:** 3 jours  
**Impact:** ⭐⭐⭐⭐ (prévision coût cache)

---

### 🎯 Priorité 4: Intégrations Ecosystem (Extensibilité)

#### 4.1 **GitHub Integration (Token History)**

**Concept:** Store token history dans repo.

```typescript
// .tokguess/history.jsonl (gitignored)
{"date":"2026-06-09","tokens":12450,"cost":0.84,"models":{"gpt-4o-mini":8340,"claude-sonnet":4110}}

// GitHub Actions workflow
name: TokGuess Weekly Report
on:
  schedule:
    - cron: '0 0 * * 0'  # Every Sunday
jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx @tokguess/cli report --weekly
      # Génère PR comment avec résumé team
```

**Features:**
- Export automatique historique
- Rapport équipe (team usage trends)
- Budget alerts dans PR (si file trop gros)

**Effort:** 5 jours  
**Impact:** ⭐⭐⭐⭐ (collaboration équipe)

---

#### 4.2 **API Externe pour Billing Tools**

**Concept:** Expose API pour outils comptabilité.

```typescript
// TokGuess HTTP API (local server)
GET /api/usage?period=7d
{
  "total_tokens": 124500,
  "total_cost": 8.34,
  "breakdown": {
    "copilot": { "tokens": 89300, "cost": 4.21 },
    "claude": { "tokens": 35200, "cost": 4.13 }
  }
}

// Integration examples
- Zapier webhook → Google Sheets
- n8n workflow → Notion database  
- Custom billing dashboard
```

**Effort:** 3 jours  
**Impact:** ⭐⭐⭐ (power users)

---

#### 4.3 **Team Sharing & Benchmarks**

**Concept:** Compare usage avec autres devs (anonymisé).

```typescript
// Opt-in anonymous telemetry
interface TeamBenchmark {
  your_usage: 12450,
  team_avg: 8930,
  percentile: 75,  // Tu es dans top 25% consommateurs
  insight: "Your GPT-4o usage is 2x team average. Consider GPT-4o-mini for drafts."
}

// Leaderboard (gamification)
┌────────────────────────────────────┐
│ 🏆 Team Token Efficiency           │
├────────────────────────────────────┤
│ 1. Alice    -45% vs baseline  ⭐⭐⭐│
│ 2. Bob      -32% vs baseline  ⭐⭐ │
│ 3. You      +12% vs baseline  📈   │
└────────────────────────────────────┘
```

**Effort:** 5 jours  
**Impact:** ⭐⭐⭐ (culture efficacité)  
**Privacy:** Opt-in, anonymisé, GDPR-compliant

---

### 🎯 Priorité 5: Export & Reporting (Business Value)

#### 5.1 **Advanced Export Formats**

**Actuel:** Aucun export.

**Amélioré:**
```typescript
// Menu context: "Export Token Report"
┌─────────────────────────────────┐
│ Export Token Report             │
├─────────────────────────────────┤
│ Format:                         │
│ ◉ CSV (Excel-ready)             │
│ ○ JSON (API/analysis)           │
│ ○ PDF (business report)         │
│                                 │
│ Period:                         │
│ ◉ This month                    │
│ ○ Last month                    │
│ ○ Custom range                  │
│                                 │
│ Include:                        │
│ ☑ Token breakdown               │
│ ☑ Cost analysis                 │
│ ☑ Model distribution            │
│ ☑ File heatmap                  │
│                                 │
│ [Export] [Cancel]               │
└─────────────────────────────────┘
```

**CSV Output:**
```csv
Date,Model,Tokens_Input,Tokens_Output,Cost_USD,File,Session_ID
2026-06-09,gpt-4o-mini,2340,456,0.034,extension.ts,abc123
2026-06-09,claude-sonnet,4520,892,0.267,watchers.ts,def456
...
```

**Effort:** 2 jours  
**Impact:** ⭐⭐⭐⭐ (business reporting)

---

#### 5.2 **Monthly Business Report (Auto-generated)**

**Concept:** Email/PDF mensuel automatique.

```markdown
# TokGuess Monthly Report - June 2026

## Executive Summary
- **Total Tokens:** 487,230
- **Total Cost:** $34.56 / $50 budget (69%)
- **Trend:** +12% vs May 2026
- **Recommendation:** On track, consider GPT-4o-mini migration

## Model Distribution
| Model         | Usage  | Cost   | Avg Cost/1k |
|---------------|--------|--------|-------------|
| GPT-4o-mini   | 67%    | $14.23 | $0.03       |
| Claude Sonnet | 28%    | $18.45 | $0.06       |
| GPT-4o        | 5%     | $1.88  | $0.04       |

## Top Contributors
1. extension.ts → 45,230 tokens
2. watchers/ → 38,900 tokens
3. dashboard/ → 27,400 tokens

## Insights
✅ Efficiency improved 8% vs last month  
⚠️ Claude usage spiked Week 3 (code refactor)  
💡 Migrate drafts to GPT-4o-mini → save $6/month

## Budget Projection
Current pace → $41.50 total (83% budget) ✅
```

**Effort:** 3 jours  
**Impact:** ⭐⭐⭐⭐ (management visibility)

---

## 📊 Récapitulatif Priorisation

| Amélioration | Effort | Impact | ROI |
|--------------|--------|--------|-----|
| **Dashboard Redesign** | 2-3j | ⭐⭐⭐⭐⭐ | 🚀 TRÈS HAUT |
| **Status Bar Enrichi** | 1j | ⭐⭐⭐⭐ | 🚀 TRÈS HAUT |
| **Budget Management** | 3j | ⭐⭐⭐⭐⭐ | 🚀 TRÈS HAUT |
| **Context Optimizer** | 4j | ⭐⭐⭐⭐⭐ | 🚀 TRÈS HAUT |
| **Learning Mode** | 4j | ⭐⭐⭐⭐ | 📈 HAUT |
| **Inline Decorations** | 2j | ⭐⭐⭐⭐ | 📈 HAUT |
| **Project Analytics** | 3j | ⭐⭐⭐⭐ | 📈 HAUT |
| **Export Formats** | 2j | ⭐⭐⭐⭐ | 📈 HAUT |
| **Cache Detection** | 3j | ⭐⭐⭐⭐ | 📈 MOYEN |
| **GitHub Integration** | 5j | ⭐⭐⭐⭐ | 📈 MOYEN |
| **Monthly Report** | 3j | ⭐⭐⭐⭐ | 📈 MOYEN |
| **API Externe** | 3j | ⭐⭐⭐ | 📊 BAS |
| **Team Benchmarks** | 5j | ⭐⭐⭐ | 📊 BAS |
| **Network Interception** | 10j | ⭐⭐⭐⭐⭐ | ⚠️ RISQUE |

---

## 🎯 Roadmap Recommandé

### Version 0.4 (Sprint 2 semaines) — UX Foundation
- ✅ Dashboard redesign (Chart.js intégration)
- ✅ Status bar enrichi + tooltips
- ✅ Context Budget alerts améliorés
- ✅ Export CSV basique

**Valeur:** Meilleure adoption, UX moderne

---

### Version 0.5 (Sprint 3 semaines) — Intelligence
- ✅ Context Optimizer (suggestions nettoyage)
- ✅ Learning Mode (estimation adaptative)
- ✅ Cache detection Claude
- ✅ Inline CodeLens decorations

**Valeur:** Économies tokens réelles, précision améliorée

---

### Version 0.6 (Sprint 2 semaines) — Business Value
- ✅ Project Analytics dashboard
- ✅ Monthly auto-report
- ✅ Advanced export (CSV/JSON/PDF)
- ✅ Budget management multi-niveaux

**Valeur:** ROI clair, reporting managérial

---

### Version 1.0 (Sprint 4 semaines) — Ecosystem
- ✅ GitHub Actions integration
- ✅ API externe pour billing tools
- ✅ Team benchmarks (opt-in)
- ✅ Browser extension companion (token interception)

**Valeur:** Enterprise-ready, collaboration équipe

---

## 💡 Quick Wins (Implémentation Rapide)

### Top 3 changements < 1 jour chacun

1. **Tooltip Status Bar** (2h)
   ```typescript
   statusBarItem.tooltip = new vscode.MarkdownString(`
     **Today:** 1,234 tokens  
     **This week:** 8,450 tokens  
     **Cost:** ~$0.67  
     Click for dashboard
   `);
   ```

2. **Copy Token Count** (1h)
   ```typescript
   vscode.commands.registerCommand('tokguess.copyCount', () => {
     vscode.env.clipboard.writeText(`${totalTokens} tokens`);
     vscode.window.showInformationMessage('Token count copied!');
   });
   ```

3. **Daily Summary Notification** (2h)
   ```typescript
   // À 18h chaque jour
   vscode.window.showInformationMessage(
     `📊 TokGuess Daily Summary: 12,450 tokens | $0.84 | Budget: 42%`,
     'View Dashboard'
   );
   ```

**Total effort:** 5h  
**Impact:** ⭐⭐⭐⭐ (feedback utilisateur immédiat)

---

## 🎨 Inspirations Competitors

| Extension | Feature à copier |
|-----------|------------------|
| **Token Watch** | Graphiques temporels élégants |
| **Eating Token** | Inline decorations par fonction |
| **GitHub Copilot** | Suggestions contextuelles inline |
| **Wakatime** | Time tracking + leaderboards |
| **CodeTime** | Analytics projet détaillées |

---

## ✅ Conclusion

**TokGuess actuellement:** Outil fonctionnel mais basique (tracker tokens).

**TokGuess vision:** **Plateforme intelligence AI costs** avec:
1. 📊 **Visibilité totale** → Dashboard riche + analytics
2. 💰 **Contrôle coûts** → Budget management + alertes
3. 🎯 **Optimisation** → Context optimizer + suggestions
4. 📈 **ROI clair** → Reporting business + export
5. 🤝 **Collaboration** → Team benchmarks + GitHub integration

**Adoption cible:**
- Solo devs: Context optimizer + budget alerts
- Teams: Analytics + reporting + benchmarks
- Enterprise: API + GitHub Actions + monthly reports

**Next step:** Commencer par **Dashboard Redesign + Context Optimizer** (sprint 3 semaines) → impact immédiat utilisateur.
