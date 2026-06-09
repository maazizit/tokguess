import * as vscode from 'vscode';
import { estimateTokensFromText } from '../estimator';

/**
 * Context Optimizer - Suggests ways to reduce token usage
 * Analyzes code and provides actionable optimization suggestions
 */

export interface OptimizationSuggestion {
  action: string;
  description: string;
  tokensSaved: number;
  confidence: 'high' | 'medium' | 'low';
  apply?: () => string; // Function to apply optimization
}

export interface ContextAnalysis {
  total_tokens: number;
  breakdown: {
    code: number;
    comments: number;
    imports: number;
    whitespace: number;
    strings: number;
    tests: number;
  };
  suggestions: OptimizationSuggestion[];
  optimized_text?: string;
}

export class ContextOptimizer {
  analyzeContext(text: string, language?: string): ContextAnalysis {
    const total = estimateTokensFromText(text);
    const lines = text.split('\n');

    // Analyze breakdown
    const breakdown = {
      code: 0,
      comments: 0,
      imports: 0,
      whitespace: 0,
      strings: 0,
      tests: 0
    };

    let commentTokens = 0;
    let importTokens = 0;
    let whitespaceTokens = 0;
    let testTokens = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      const lineTokens = estimateTokensFromText(line);

      // Comments
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('#')
      ) {
        commentTokens += lineTokens;
        breakdown.comments += lineTokens;
        continue;
      }

      // Imports
      if (
        trimmed.startsWith('import ') ||
        trimmed.startsWith('from ') ||
        trimmed.startsWith('require(') ||
        trimmed.startsWith('const ') && trimmed.includes('require(')
      ) {
        importTokens += lineTokens;
        breakdown.imports += lineTokens;
        continue;
      }

      // Whitespace
      if (trimmed === '') {
        whitespaceTokens += 1;
        breakdown.whitespace += 1;
        continue;
      }

      // Tests
      if (
        trimmed.includes('describe(') ||
        trimmed.includes('it(') ||
        trimmed.includes('test(') ||
        trimmed.includes('expect(')
      ) {
        testTokens += lineTokens;
        breakdown.tests += lineTokens;
        continue;
      }

      // Regular code
      breakdown.code += lineTokens;
    }

    // Generate suggestions
    const suggestions: OptimizationSuggestion[] = [];

    if (commentTokens > 200) {
      suggestions.push({
        action: 'Remove comments',
        description: 'Strip all comments from code',
        tokensSaved: commentTokens,
        confidence: 'high',
        apply: () => this.removeComments(text, language)
      });
    }

    if (importTokens > 100) {
      suggestions.push({
        action: 'Remove imports',
        description: 'Remove import statements (AI can infer)',
        tokensSaved: importTokens,
        confidence: 'medium',
        apply: () => this.removeImports(text)
      });
    }

    if (testTokens > 500) {
      suggestions.push({
        action: 'Remove test blocks',
        description: 'Exclude test code from context',
        tokensSaved: testTokens,
        confidence: 'high',
        apply: () => this.removeTests(text)
      });
    }

    if (whitespaceTokens > 50) {
      suggestions.push({
        action: 'Minify whitespace',
        description: 'Compact code by removing excess whitespace',
        tokensSaved: whitespaceTokens,
        confidence: 'medium',
        apply: () => this.minifyWhitespace(text)
      });
    }

    // Large string literals
    const stringMatches = text.match(/"[^"]{100,}"|'[^']{100,}'|`[^`]{100,}`/g);
    if (stringMatches && stringMatches.length > 0) {
      const stringTokens = stringMatches.reduce(
        (sum, str) => sum + estimateTokensFromText(str),
        0
      );
      breakdown.strings = stringTokens;
      suggestions.push({
        action: 'Truncate long strings',
        description: 'Replace large string literals with placeholders',
        tokensSaved: Math.floor(stringTokens * 0.7),
        confidence: 'low'
      });
    }

    return {
      total_tokens: total,
      breakdown,
      suggestions: suggestions.sort((a, b) => b.tokensSaved - a.tokensSaved)
    };
  }

  applyOptimizations(text: string, suggestions: OptimizationSuggestion[]): string {
    let optimized = text;

    for (const suggestion of suggestions) {
      if (suggestion.apply) {
        optimized = suggestion.apply();
      }
    }

    return optimized;
  }

  private removeComments(text: string, language?: string): string {
    let result = text;

    // Single-line comments
    result = result.replace(/\/\/.*$/gm, '');
    result = result.replace(/#.*$/gm, '');

    // Multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');

    // Python docstrings
    if (language === 'python') {
      result = result.replace(/"""[\s\S]*?"""/g, '');
      result = result.replace(/'''[\s\S]*?'''/g, '');
    }

    return result;
  }

  private removeImports(text: string): string {
    return text
      .split('\n')
      .filter(
        (line) =>
          !line.trim().startsWith('import ') &&
          !line.trim().startsWith('from ') &&
          !line.trim().match(/^const .* = require\(/)
      )
      .join('\n');
  }

  private removeTests(text: string): string {
    // Remove test blocks (simplified)
    let result = text.replace(/describe\([^{]*\{[\s\S]*?\}\);?/g, '');
    result = result.replace(/it\([^{]*\{[\s\S]*?\}\);?/g, '');
    result = result.replace(/test\([^{]*\{[\s\S]*?\}\);?/g, '');
    return result;
  }

  private minifyWhitespace(text: string): string {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }

  async showOptimizationDialog(
    analysis: ContextAnalysis,
    document: vscode.TextDocument
  ): Promise<string | undefined> {
    if (analysis.suggestions.length === 0) {
      void vscode.window.showInformationMessage('✅ Context already optimized!');
      return undefined;
    }

    const panel = vscode.window.createWebviewPanel(
      'tokguessOptimizer',
      'Context Optimizer',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = this.getOptimizationHtml(analysis, document.fileName);

    return new Promise((resolve) => {
      panel.webview.onDidReceiveMessage((message) => {
        if (message.command === 'apply') {
          const selectedSuggestions = message.suggestions as string[];
          const toApply = analysis.suggestions.filter((s) =>
            selectedSuggestions.includes(s.action)
          );
          const optimized = this.applyOptimizations(document.getText(), toApply);
          resolve(optimized);
          panel.dispose();
        } else if (message.command === 'cancel') {
          resolve(undefined);
          panel.dispose();
        }
      });
    });
  }

  private getOptimizationHtml(analysis: ContextAnalysis, fileName: string): string {
    const totalSavings = analysis.suggestions.reduce((sum, s) => sum + s.tokensSaved, 0);
    const newTotal = analysis.total_tokens - totalSavings;

    const suggestionsHtml = analysis.suggestions
      .map(
        (s) => `
      <div class="suggestion">
        <input type="checkbox" id="${s.action}" checked />
        <label for="${s.action}">
          <strong>${s.action}</strong>
          <span class="tokens">-${s.tokensSaved.toLocaleString()} tokens</span>
          <div class="desc">${s.description}</div>
        </label>
      </div>
    `
      )
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { padding: 20px; font-family: -apple-system, system-ui; }
    h2 { margin-top: 0; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .suggestion { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
    .suggestion:hover { background: #f9f9f9; }
    .tokens { color: #28a745; font-weight: bold; float: right; }
    .desc { color: #666; font-size: 0.9em; margin-top: 5px; }
    button { padding: 10px 20px; margin: 10px 10px 0 0; cursor: pointer; }
    .apply { background: #007acc; color: white; border: none; border-radius: 4px; }
    .cancel { background: #ccc; border: none; border-radius: 4px; }
  </style>
</head>
<body>
  <h2>⚡ Context Optimizer</h2>
  <p><strong>File:</strong> ${fileName}</p>
  
  <div class="summary">
    <div>📊 <strong>Current:</strong> ${analysis.total_tokens.toLocaleString()} tokens</div>
    <div>✅ <strong>Optimized:</strong> ${newTotal.toLocaleString()} tokens</div>
    <div>💰 <strong>Savings:</strong> ${totalSavings.toLocaleString()} tokens (${((totalSavings / analysis.total_tokens) * 100).toFixed(0)}%)</div>
  </div>

  <h3>💡 Optimization Suggestions:</h3>
  ${suggestionsHtml}

  <button class="apply" onclick="apply()">Apply Selected</button>
  <button class="cancel" onclick="cancel()">Cancel</button>

  <script>
    const vscode = acquireVsCodeApi();
    function apply() {
      const selected = Array.from(document.querySelectorAll('input:checked'))
        .map(el => el.id);
      vscode.postMessage({ command: 'apply', suggestions: selected });
    }
    function cancel() {
      vscode.postMessage({ command: 'cancel' });
    }
  </script>
</body>
</html>`;
  }
}
