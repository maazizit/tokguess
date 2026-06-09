# TokGuess — Mode « Plus de précision » (Copilot)

**Version cible :** v0.6.0  
**Statut :** Implémenté v0.6.0 (MVP)  
**Auteur :** Zahra Maaziz  
**Date :** 2026-06-09

---

## 1. Résumé

Ajouter un bouton **« Plus de précision »** dans le dashboard TokGuess.

| Mode | Source | Précision tokens | Setup |
|------|--------|------------------|-------|
| **Standard** (défaut) | `Chat.log` | ~75–85 % estimé | Aucun |
| **Plus de précision** | OpenTelemetry local | **Réel** (compteur Copilot) | 1 clic + reload |

**Scope :** ce mode concerne **uniquement GitHub Copilot**. Claude et Antigravity gardent leur logique actuelle (déjà précise via JSONL).

**Différenciateur TokGuess :** le collègue configure Aspire/OTel à la main. TokGuess propose le **même principe, pré-configuré**, avec guide simple pour non-experts.

---

## 2. Guide utilisateur (non-technique)

### C’est quoi le « mini serveur local » ?

Imagine un **carnet de notes sur ton Mac**, à côté de VS Code.

```
VS Code (Copilot)  →  écrit la conso  →  carnet local  →  TokGuess lit le carnet
```

- Le « serveur » = un **petit programme qui tourne sur ta machine** (`localhost`)
- Il **ne part pas sur internet**
- Il **ne stocke pas tes prompts** (seulement : tokens, modèle, durée, agent)
- TokGuess le lit pour afficher des **vrais chiffres** au lieu d’estimer

**Analogie :** mode standard = deviner la conso électrique au bruit du moteur. Mode précision = lire le compteur officiel — mais le compteur reste **chez toi**.

### Quand activer « Plus de précision » ?

✅ Tu utilises **GitHub Copilot** dans VS Code  
✅ Tu veux des **tokens réels** (pas ~estimés)  
✅ Tu acceptes **1 clic + reload VS Code** au premier setup  

❌ Pas utile si tu n’utilises que Claude Code (déjà précis)  
❌ Pas de facture Microsoft exacte (Copilot Enterprise = forfait, pas pay-per-token)

### Ce que voit l’utilisateur (parcours simple)

```
1. Ouvre TokGuess dashboard
2. Voit badge : « ~estimé · Chat.log »
3. Clique « Plus de précision »
4. Assistant 3 étapes :
   ┌─────────────────────────────────────────┐
   │ Étape 1/3 — Activer la télémétrie       │
   │ TokGuess configure VS Code pour toi.    │
   │ [Continuer]                               │
   ├─────────────────────────────────────────┤
   │ Étape 2/3 — Démarrer le collecteur      │
   │ Un mini service local démarre.          │
   │ [Démarrer]  (ou Docker si dispo)        │
   ├─────────────────────────────────────────┤
   │ Étape 3/3 — Vérification                │
   │ ✅ Connecté · tokens réels actifs       │
   │ [Terminer] → Reload VS Code              │
   └─────────────────────────────────────────┘
5. Badge devient : « réel · OTel »
6. Dashboard affiche tokens Copilot exacts
```

### Messages UI (ton simple)

| Situation | Message |
|-----------|---------|
| Mode standard | `Source : Chat.log · ~75–85 % approx.` |
| Mode précision actif | `Source : OTel local · tokens réels Copilot` |
| OTel down | `Précision indisponible — retour estimé` |
| Pas Copilot | Bouton grisé : `Réservé à GitHub Copilot` |
| Setup échoué | `Setup incomplet — réessayer ou rester en mode estimé` |

### FAQ rapide (pour l’équipe)

**Q : Mes données partent sur internet ?**  
R : Non. Tout reste sur `localhost`.

**Q : C’est la facture Entreprise ?**  
R : Non. Tokens réels + prix = projection tarifs API publics.

**Q : Je peux revenir en arrière ?**  
R : Oui. Bouton « Mode standard » désactive OTel.

**Q : Ça marche sans Docker ?**  
R : Oui. TokGuess embarque un collecteur léger (binaire Node intégré).

---

## 3. Architecture technique

### 3.1 Flux de données

```text
┌─────────────────────────────────────────────────────────────┐
│ VS Code + GitHub Copilot                                     │
│   emits OTel spans: invoke_agent, Tokens, model, agent      │
└──────────────────────────┬──────────────────────────────────┘
                           │ OTLP HTTP :4318
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ TokGuess Local Collector (localhost:4318)                    │
│   - reçoit spans                                            │
│   - filtre attributs sensibles (scrubbing)                    │
│   - stocke en mémoire + fichier rotatif local                │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP GET /api/spans (localhost:4319)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ TokGuess Extension — OtelWatcher (nouveau)                   │
│   - poll collector toutes les 3s si dashboard ouvert        │
│   - merge dans UsageStore avec source: copilot, estimated:0 │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Dashboard — badge + stats Copilot en mode réel                │
│ Claude / Antigravity : inchangés (JSONL watchers)            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Fallback automatique

```text
Si collector down OU pas de spans depuis 5 min
  → Copilot repasse sur Chat.log (estimé)
  → badge orange : « fallback estimé »
  → notification discrète (pas popup agressive)
```

### 3.3 Settings VS Code injectés (pré-configurés)

TokGuess écrit dans `settings.json` (workspace ou user, configurable) :

```json
{
  "github.copilot.chat.logging": true,
  "telemetry.enableTelemetry": true,
  "opentelemetry.exporter.otlp.endpoint": "http://localhost:4318/v1/traces"
}
```

> Note : clés exactes à valider contre la version VS Code / Copilot du moment.  
> Le wizard teste la connectivité après injection.

### 3.4 Span Copilot — champs cibles

D’après traces Aspire observées :

| Attribut | Usage TokGuess |
|----------|----------------|
| `Tokens` (ou équivalent) | `inputTokens + outputTokens` |
| modèle (`gpt-4o-mini`, etc.) | pricing |
| `copilot_chat.mode_name` | agent / session label |
| durée span | fallback si tokens absents |
| `session_id` | dédup |

### 3.5 Sécurité (obligatoire)

| Règle | Implémentation |
|-------|----------------|
| Local only | collector bind `127.0.0.1` uniquement |
| Pas de cloud | aucun export OTLP externe par défaut |
| Scrubbing | supprimer attributs `prompt*`, `content*`, `message*` |
| Rétention | max 7 jours, rotation 50 Mo |
| Opt-in | jamais activé sans clic utilisateur |
| Désactivation | 1 clic « Mode standard » revert settings |

---

## 4. Scope

### In scope (v0.6)

- [x] Bouton « Plus de précision » dashboard (Copilot only)
- [x] Wizard setup 3 étapes (langage simple)
- [x] Collector local embarqué (Node, pas Docker requis)
- [x] `OtelWatcher` — ingestion spans Copilot
- [x] Merge UsageStore : tokens réels Copilot
- [x] Badge dashboard : estimé vs réel
- [x] Fallback Chat.log auto
- [x] Désactivation / revert settings
- [x] Guide utilisateur intégré (webview ou markdown)

### Out of scope (v0.6)

- Aspire UI embarquée (on lit les données, pas le dashboard .NET)
- Facturation Copilot Enterprise réelle
- OTel pour Claude / Antigravity (déjà JSONL)
- Export cloud / équipe (v0.7+)
- Docker obligatoire

---

## 5. Fichiers à créer / modifier

### Nouveaux fichiers

| Fichier | Rôle |
|---------|------|
| `src/watchers/otelWatcher.ts` | Poll collector, parse spans Copilot |
| `src/collector/miniCollector.ts` | Serveur OTLP HTTP local léger |
| `src/collector/scrubber.ts` | Filtre attributs sensibles |
| `src/setup/precisionWizard.ts` | Wizard 3 étapes + health check |
| `src/setup/copilotSettings.ts` | Inject / revert VS Code settings |
| `media/precision-guide.html` | Guide visuel non-technique (optionnel) |
| `docs/PRECISION-MODE-USER.md` | Doc utilisateur (extrait section 2) |

### Fichiers à modifier

| Fichier | Changement |
|---------|------------|
| `src/dashboard/EnhancedDashboardProvider.ts` | Bouton + badge mode |
| `src/extension.ts` | Wire OtelWatcher, wizard command |
| `src/storage/usageStore.ts` | Priorité OTel > Chat.log pour Copilot |
| `src/types.ts` | `precisionMode: 'estimated' \| 'otel' \| 'fallback'` |
| `package.json` | v0.6.0, settings, command `tokguess.enablePrecision` |

---

## 6. Tasks (ordre d’implémentation)

### Phase 0 — Recherche (0.5 j)

| # | Task | Done |
|---|------|------|
| 0.1 | Valider clés settings VS Code / Copilot OTel version actuelle | ☐ |
| 0.2 | Capturer 5 spans réels Aspire → documenter attributs exacts | ☐ |
| 0.3 | Tester endpoint OTLP HTTP minimal (curl + sample span) | ☐ |

### Phase 1 — Collector local (2 j)

| # | Task | Done |
|---|------|------|
| 1.1 | `miniCollector.ts` — serveur OTLP HTTP `:4318`, bind localhost | ☐ |
| 1.2 | `scrubber.ts` — filtre attributs sensibles | ☐ |
| 1.3 | Stockage mémoire + fichier rotatif `~/.tokguess/otel-spans.jsonl` | ☐ |
| 1.4 | API lecture `GET localhost:4319/api/spans?since=` | ☐ |
| 1.5 | Health check `GET localhost:4319/health` | ☐ |
| 1.6 | Start / stop collector depuis extension (child process) | ☐ |

### Phase 2 — OtelWatcher (2 j)

| # | Task | Done |
|---|------|------|
| 2.1 | `otelWatcher.ts` — poll API collector | ☐ |
| 2.2 | Parser spans Copilot → `TokenEvent` | ☐ |
| 2.3 | Dedup par `request_id` / timestamp | ☐ |
| 2.4 | `estimated: false` flag sur events OTel | ☐ |
| 2.5 | Merge UsageStore : OTel remplace estimé même requête | ☐ |
| 2.6 | Fallback → Chat.log si collector silent > 5 min | ☐ |

### Phase 3 — Wizard & settings (1.5 j)

| # | Task | Done |
|---|------|------|
| 3.1 | `copilotSettings.ts` — inject OTel settings | ☐ |
| 3.2 | `precisionWizard.ts` — 3 étapes QuickPick / webview | ☐ |
| 3.3 | Health check post-setup | ☐ |
| 3.4 | Revert « Mode standard » — restore settings + stop collector | ☐ |
| 3.5 | Persister état `precisionMode` dans `globalState` | ☐ |
| 3.6 | Désactiver bouton si `tokguess.sources.copilot.enabled = false` | ☐ |

### Phase 4 — Dashboard UI (1 j)

| # | Task | Done |
|---|------|------|
| 4.1 | Bouton « Plus de précision » (Copilot only) | ☐ |
| 4.2 | Badge : `~estimé` / `réel OTel` / `fallback` | ☐ |
| 4.3 | Section agent (`mode_name`) si dispo OTel | ☐ |
| 4.4 | Lien « Comment ça marche ? » → guide section 2 | ☐ |
| 4.5 | Griser bouton si Copilot désactivé | ☐ |

### Phase 5 — Tests & doc (1 j)

| # | Task | Done |
|---|------|------|
| 5.1 | Test unitaire scrubber | ☐ |
| 5.2 | Test parser span → TokenEvent | ☐ |
| 5.3 | Test fallback estimé → OTel → fallback | ☐ |
| 5.4 | `docs/PRECISION-MODE-USER.md` — guide équipe | ☐ |
| 5.5 | Changelog v0.6.0 | ☐ |
| 5.6 | VSIX + push GitHub | ☐ |

**Total estimé : ~7–8 jours**

---

## 7. Critères d’acceptation

| # | Critère |
|---|---------|
| AC1 | Mode standard inchangé — zero régression |
| AC2 | Bouton visible uniquement si Copilot activé |
| AC3 | Wizard complétable en < 2 min par non-expert |
| AC4 | Tokens Copilot OTel = valeur span (ex: 13736) |
| AC5 | Fallback auto si collector arrêté |
| AC6 | Collector bind `127.0.0.1` only |
| AC7 | Aucun attribut prompt dans stockage local |
| AC8 | « Mode standard » revert complet en 1 clic |
| AC9 | Claude / Antigravity non impactés |

---

## 8. Commandes VS Code (nouvelles)

| Commande | Description |
|----------|-------------|
| `tokguess.enablePrecision` | Lance wizard « Plus de précision » |
| `tokguess.disablePrecision` | Revert mode standard |
| `tokguess.collectorStatus` | Affiche état collector (debug) |

---

## 9. Settings (nouveaux)

| Setting | Default | Description |
|---------|---------|-------------|
| `tokguess.precision.enabled` | `false` | Mode OTel actif |
| `tokguess.precision.collectorPort` | `4318` | Port OTLP |
| `tokguess.precision.apiPort` | `4319` | Port API lecture |
| `tokguess.precision.retentionDays` | `7` | Rétention spans |
| `tokguess.precision.autoFallback` | `true` | Fallback Chat.log si OTel down |

---

## 10. Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| Clés settings VS Code changent | Phase 0 validation + version check |
| Port 4318 occupé | auto-detect + proposer 4318+N |
| Spans sans champ Tokens | fallback durée × débit (comme aujourd’hui) |
| Secu — données sensibles | scrubber obligatoire |
| User abandonne wizard | état partiel revert auto |

---

## 11. Positionnement vs collègue (OTel / Aspire)

| | Collègue DIY | TokGuess Plus précision |
|---|---|---|
| Setup | manuel Aspire + config | 1 clic wizard |
| Public cible | experts AI | tous devs |
| Tokens | réels | réels (même source) |
| Prix | tarif API (manuel) | tarif API (auto) |
| Secu | responsabilité user | localhost + scrubbing par défaut |
| Fallback | non | estimé auto |

**Phrase pitch :**

> Même précision tokens que OTel/Aspire, zéro config manuelle, fallback estimé si le collecteur est off.

---

## 12. Prochaine étape

1. Valider cette spec avec l’équipe
2. Phase 0 — capturer spans réels sur machine dev
3. Implémenter Phase 1 → 5
4. Release v0.6.0

---

*TokGuess — spec interne, ne pas publier sur Marketplace tel quel.*
