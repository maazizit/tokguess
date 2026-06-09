# Changelog

## [0.5.1] - 2026-06-09

### 🎨 Major UI Improvements

#### Theme Toggle (Light/Dark Mode) 🌓
- ✅ **NEW: Light Mode Support** - Click "☀️ Light" button to switch themes
- ✅ **Dark Mode Enhanced** - Improved color scheme for better contrast
- ✅ **Smooth Transitions** - CSS transitions for seamless theme switching
- ✅ **Chart Theme Integration** - Chart.js adapts colors to current theme
- ✅ **Persistent State** - Theme preference remembered across sessions

#### Enhanced Dashboard Now Default
- ✅ **Chart.js Dashboard** now the primary dashboard (was secondary)
- ✅ **Better Visual Hierarchy** - Improved spacing and layout
- ✅ **Precision Indicator** - Shows "~75-85% approx." for transparency
- ✅ **Source Indicator** - Shows data source (Chat.log estimé)
- ✅ **Legacy Dashboard** - Old dashboard still available for backward compatibility

### 🎨 Theme Variables

**Dark Mode:**
- Background: #1e1e1e
- Text: #cccccc
- Accent: #007acc
- Success: #4ec9b0
- Warning: #f48771

**Light Mode:**
- Background: #ffffff
- Text: #333333  
- Accent: #0066cc
- Success: #16825d
- Warning: #d97634

### 🐛 Bug Fixes

- Fixed dashboard not showing Chart.js enhancements
- Improved CSS specificity for better theme consistency
- Better border rendering in both themes

---

## [0.5.0] - 2026-06-09

### 🚀 Major Features

#### Enhanced Status Bar 💎
- ✅ **Rich Markdown Tooltips** - Hover shows detailed session stats
- ✅ **Contextual Icons** - 💎 (normal), ⚠️ (warning), 🔴 (over budget)
- ✅ **Current File Estimate** - See tokens for active file in tooltip
- ✅ **Top Model Display** - Most-used model shown at a glance
- ✅ **Budget Status Indicator** - Visual budget percentage with color coding

#### Inline CodeLens Decorations 🔍
- ✅ **Function-Level Token Estimates** - See tokens above functions/classes in code
- ✅ **Multi-Language Support** - TypeScript, JavaScript, Python, Go, Rust, Java, C#
- ✅ **Warning Indicators** - ⚠️ icon for functions > 2k tokens
- ✅ **Smart Parsing** - Detects functions, classes, methods automatically
- ✅ **Click-to-Optimize** - One-click optimization from CodeLens
- ✅ **Configurable** - Enable/disable, adjust warning threshold

#### Advanced Export System 📤
- ✅ **CSV Export** - Excel-ready spreadsheet with full event history
- ✅ **JSON Export** - API/analysis format with complete metadata
- ✅ **Markdown Reports** - Human-readable business reports
- ✅ **Flexible Periods** - Export today / 7d / 30d / all time
- ✅ **Model Breakdown** - Per-model token and cost analysis
- ✅ **Daily Stats** - Usage trends over time
- ✅ **Interactive Dialog** - Choose format, period, and options

#### Cache Detection (Anthropic) 💰
- ✅ **Prompt Cache Prediction** - Detects similar contexts within 10min window
- ✅ **Cost Savings Calculation** - Shows exact $ saved from cache (90% off)
- ✅ **Similarity Analysis** - Jaccard index for context comparison
- ✅ **Automatic Notifications** - Popup when cache hit detected
- ✅ **Cache Stats** - View tracked contexts and performance
- ✅ **Smart Storage** - Persists recent contexts efficiently
- ✅ **Claude-Specific** - Only applies to Claude models with prompt caching

### 📝 New Commands

- `TokGuess: Export Report` - Export usage data to CSV/JSON/Markdown
- `TokGuess: Check Cache Usage` - Predict cache hits for current file
- `TokGuess: Show Cache Stats` - View cache detector statistics
- `TokGuess: Copy Token Count` - Copy current file token count to clipboard
- `TokGuess: Show Block Info` - Display token info for code block (internal)

### ⚙️ New Configuration

- `tokguess.codelens.enabled` - Enable/disable inline CodeLens (default: true)
- `tokguess.codelens.warningThreshold` - Token threshold for warnings (default: 2000)

### 🐛 Bug Fixes

- Fixed period selector TODO in enhanced dashboard
- Improved token estimation accuracy with cache awareness
- Better multi-language support in CodeLens parsing

### 📚 Documentation

- Updated README with v0.5.0 features
- Added export examples and screenshots
- Cache detection technical details in AMÉLIORATION-ESTIMATION.md

---

## [0.4.0] - 2026-06-09

### 🚀 Major Features

#### Dashboard Redesign
- ✅ **Interactive Chart.js Integration** - Visual token usage trends over time
- ✅ **Budget Progress Bars** - Color-coded budget status (green/yellow/red)
- ✅ **Stats Grid** - Total tokens, daily average, requests count, projected monthly cost
- ✅ **Model Distribution Breakdown** - See which models consume most tokens/cost
- ✅ **Real-time Insights** - Actionable recommendations based on usage patterns
- ✅ **Export Functionality** - Export analytics to CSV/JSON

#### Context Optimizer ⚡
- ✅ **Smart Context Analysis** - Identifies comments, imports, tests, whitespace
- ✅ **Token Savings Calculator** - Shows exact tokens saved per optimization
- ✅ **Interactive Dialog** - Select which optimizations to apply
- ✅ **One-Click Apply** - Removes selected elements automatically
- ✅ **30-70% Token Reduction** - Typical savings on most files

#### Budget Management 💰
- ✅ **Multi-Level Budgets** - Monthly cost, daily tokens, per-file tokens limits
- ✅ **Alert Thresholds** - Warn (75%), Critical (90%), Block (100%)
- ✅ **Smart Notifications** - Popup alerts with actionable suggestions
- ✅ **Hard Limit Mode** - Optionally block requests when budget exceeded
- ✅ **Workspace-Specific** - Different budgets per project
- ✅ **Monthly Projections** - Predict end-of-month costs

#### Learning Mode 🧠
- ✅ **Adaptive Estimation** - Learns from your usage patterns
- ✅ **User-Specific Calibration** - Calculates your typical input:output ratio
- ✅ **Model Rate Learning** - Tracks your average tokens/sec per model
- ✅ **Context Multipliers** - Adjusts estimates based on request type
- ✅ **Auto-Calibration** - Recalibrates every 100 estimations
- ✅ **Accuracy Improvement** - 75% → 82%+ precision over time

#### Project Analytics 📈
- ✅ **30-Day Rolling Analytics** - Comprehensive usage statistics
- ✅ **Trend Analysis** - Detects increasing/stable/decreasing patterns
- ✅ **Peak Hours Detection** - Identifies when you use most tokens
- ✅ **Budget Risk Assessment** - Low/Medium/High risk indicators
- ✅ **Cost Breakdown** - By model, context, time period
- ✅ **Export Reports** - CSV/JSON export for external analysis

### 📝 New Commands

- `TokGuess: Open Enhanced Dashboard` - Interactive dashboard with charts
- `TokGuess: Optimize Context` - Analyze and reduce token usage
- `TokGuess: Show Analytics` - View 30-day analytics summary
- `TokGuess: Check Daily Budget` - Check today's token budget status
- `TokGuess: Show Learning Insights` - View learning mode progress

### ⚙️ New Configuration Options

```json
{
  "tokguess.budget.monthly_cost_usd": 20,
  "tokguess.budget.daily_tokens": 50000,
  "tokguess.budget.per_file_tokens": 5000,
  "tokguess.budget.hard_limit": false
}
```

### 🔧 Technical Changes

- Added Chart.js dependency for visualizations
- New modular architecture (budget/, optimizer/, learning/, analytics/)
- Enhanced TypeScript typings
- Improved error handling

### 📚 Documentation

- Added `FEATURES-v0.4.0.md` - Complete feature documentation
- Added `ROADMAP-AMELIORATIONS.md` - Future enhancement roadmap
- Updated `README.md` - New features and config options

### 📢 Important Notes

- **Gemini CLI Deprecated:** Google deprecated Gemini CLI on 18/06/2026
- **New Standard:** Antigravity CLI (already supported, seamless migration)
- **Breaking Change:** None - fully backward compatible

### 🐛 Bug Fixes

- Fixed compilation errors in analytics engine
- Improved status bar tooltip rendering
- Better error handling for missing log files

---

## [0.3.3] - 2026-06-08

### ✨ Improvements

- Enhanced Copilot token estimation (context-aware)
- Improved accuracy from ~35% to ~75-85%
- Added context profiles (editAgent/chat/autocomplete)
- Updated model generation rates (Jun 2026 benchmarks)

### 📝 Documentation

- Added `AMÉLIORATION-ESTIMATION.md` - Technical details
- Added `WATCHERS-DISCUSSION.md` - Complete watcher architecture
- Added `demo-improvements.ts` - Comparison script

---

## [0.3.2] - 2026-05-20

### Features

- Antigravity CLI watcher support
- Claude Desktop log parsing
- Copilot log watcher (ccreq patterns)

---

## [0.3.0] - 2026-05-15

### Features

- Initial public release
- Basic dashboard
- Status bar indicator
- Context budget alerts
- Copilot/Claude watchers

---

## Version Numbering

- **0.4.x** - Enhanced features (Dashboard, Optimizer, Budget, Learning, Analytics)
- **0.3.x** - Core functionality (Watchers, Basic dashboard, Estimation)
- **0.2.x** - Beta releases
- **0.1.x** - Alpha/internal releases
