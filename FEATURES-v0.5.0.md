# TokGuess v0.5.0 — Features Summary

**Release Date:** June 9, 2026  
**Status:** ✅ Implemented

---

## 🎯 Overview

Version 0.5.0 focuses on **immediate visibility**, **business value**, and **cost savings** through:

1. **Enhanced Status Bar** — Rich tooltips, contextual states
2. **Inline CodeLens** — See tokens directly in code
3. **Advanced Export** — CSV/JSON/Markdown reports
4. **Cache Detection** — Predict Anthropic cache savings

---

## ✨ Key Features

### 1. Enhanced Status Bar 💎

**Before:** Simple text "🤖 1,234 tok · $0.04"  
**After:** Rich markdown tooltip with session details

**Hover to see:**
- Today's total tokens
- Current file estimate
- Top model used
- Budget status (🟢🟡🔴)
- One-click dashboard access

**States:**
- 💎 Normal
- ⚠️ Warning (budget > 75%)
- 🔴 Over budget

---

### 2. Inline CodeLens 🔍

**See token estimates directly above functions/classes in your code:**

```typescript
// 💎 ~450 tokens
export function processData(data: string) {
  // ...
}

// ⚠️ ~2,340 tokens
export class DataProcessor {
  // ...
}
```

**Supported languages:**
- TypeScript/JavaScript (React included)
- Python
- Go
- Rust
- Java
- C#

**Warning threshold:** Functions > 2k tokens show ⚠️ icon

**Click any CodeLens:**
- View detailed info
- One-click optimize option

**Configuration:**
```json
{
  "tokguess.codelens.enabled": true,
  "tokguess.codelens.warningThreshold": 2000
}
```

---

### 3. Advanced Export 📤

**Export token usage reports in multiple formats:**

**Formats:**
- **CSV** — Excel-ready, full event history with columns:
  - Date, Model, Source, Session, Input/Output/Cache tokens, Cost, Estimated flag
- **JSON** — Complete data structure for analysis/API integration
- **Markdown** — Human-readable business reports with:
  - Executive summary (total tokens, cost, requests)
  - Model distribution table
  - Daily usage trends
  - Top files (if enabled)

**Periods:**
- Today only
- Last 7 days
- Last 30 days
- All time

**Options:**
- ☑ Include model breakdown
- ☑ Include file heatmap
- ☑ Include cost analysis

**Usage:**
```bash
Cmd+Shift+P → "TokGuess: Export Report"
```

Select format → period → options → save location → done!

**Example CSV:**
```csv
Date,Model,Source,Session,Input_Tokens,Output_Tokens,Cache_Read,Total_Tokens,Cost_USD,Estimated
2026-06-09,gpt-4o-mini,copilot,abc123,2340,456,0,2796,0.0340,yes
2026-06-09,claude-sonnet,claude,def456,4520,892,1200,6612,0.2670,no
```

**Example Markdown:**
```markdown
# TokGuess Token Usage Report

**Generated:** June 9, 2026 14:23

## Executive Summary
- **Total Tokens:** 487,230
- **Total Cost:** $34.56
- **Total Requests:** 1,234

## Model Distribution
| Model | Tokens | Cost | Requests | Percentage |
|-------|--------|------|----------|------------|
| GPT-4o-mini | 327,450 | $14.23 | 890 | 67% |
| Claude Sonnet | 136,240 | $18.45 | 280 | 28% |
```

---

### 4. Cache Detection 💰

**Anthropic Prompt Caching:** When you send similar context within 5-10 minutes, Anthropic caches it and charges 90% less for input tokens.

**TokGuess now predicts cache hits!**

**How it works:**
1. Records recent contexts (last 10 minutes)
2. Compares new context with stored contexts
3. Uses Jaccard similarity (word n-grams)
4. If similarity > 70% → cache hit predicted

**Notification example:**
```
💰 Cache detected! ~2,340 tokens cached → save $0.023 (87% similarity)
```

**Commands:**
- `TokGuess: Check Cache Usage` — Check current file
- `TokGuess: Show Cache Stats` — View detector stats

**Cache Stats:**
- Tracked contexts: 12
- Avg tokens: 3,450
- Oldest: 4 min ago

**Savings calculation:**
- Normal cost: $3/M input tokens
- Cached cost: $0.30/M (90% off)
- Savings: $2.70/M per cached token

**Note:** Only applies to Claude models. Other models (GPT, Gemini) don't have prompt caching.

---

## 🚀 Quick Wins

### Copy Token Count (New!)
```bash
Cmd+Shift+P → "TokGuess: Copy Token Count"
```
Copies current file token count to clipboard for quick sharing.

### Keyboard Shortcuts
- `Ctrl+Shift+T` — Open dashboard
- Right-click in editor → "Optimize Context"
- Right-click in editor → "Copy Token Count"

---

## 📊 Comparison: v0.4.0 → v0.5.0

| Feature | v0.4.0 | v0.5.0 |
|---------|--------|--------|
| Status bar | Simple text | Rich markdown tooltip |
| Inline visibility | ❌ | ✅ CodeLens decorations |
| Export | Basic CSV | CSV/JSON/Markdown with options |
| Cache awareness | ❌ | ✅ Prediction + savings |
| Multi-language CodeLens | ❌ | ✅ 7 languages supported |
| Quick actions | Limited | Copy, cache check, export |

---

## 🎯 Use Cases

### For Solo Developers
- **CodeLens** — See which functions are token-heavy
- **Cache detection** — Know when you're saving money
- **Copy token count** — Quick estimates for planning

### For Teams
- **Export CSV** — Share usage data with management
- **Markdown reports** — Monthly summaries for billing
- **Cache stats** — Track optimization opportunities

### For Cost-Conscious Users
- **Budget status in status bar** — Constant awareness
- **Cache notifications** — Know when Anthropic is discounting
- **Export for analysis** — Deep-dive into spending patterns

---

## 📈 Roadmap Ahead

**v0.6.0 (Coming Soon):**
- Period selector in dashboard (fix TODO line 91)
- Daily summary notifications
- Context menu improvements
- Monthly auto-reports

**v1.0 (Future):**
- GitHub Actions integration
- Team benchmarks
- API for external tools
- Browser extension companion

---

## 🐛 Known Issues / Limitations

1. **CodeLens performance** — Disabled for files > 500KB
2. **Cache detection** — Estimation only, not 100% accurate
3. **Export** — No PDF format yet (coming in v0.6)
4. **Duration capture** — TODO line 94 (not critical)

---

## 📦 Installation

**v0.5.0 installed:** Already active if you updated!

**Verify version:**
```bash
Cmd+Shift+P → "Extensions: Show Installed Extensions"
→ Look for "TokGuess v0.5.0"
```

**Compile and test:**
```bash
cd /Users/zahramaaziz/Desktop/tokguess
npm run compile
npm run package  # Creates .vsix
```

---

**Questions? Issues?**  
Open issue on GitHub: https://github.com/maazizit/tokguess

**Happy token tracking! 💎**
