import * as vscode from 'vscode';
import { estimateTokensFromText } from '../estimator';

/**
 * Provides inline CodeLens decorations showing token estimates for functions/classes
 */
export class TokenCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private enabled = true;
  private warningThreshold = 2000; // Warn if function > 2k tokens

  constructor() {
    // Refresh on config change
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tokguess.codelens')) {
        this.enabled = vscode.workspace
          .getConfiguration('tokguess')
          .get('codelens.enabled', true);
        this.warningThreshold = vscode.workspace
          .getConfiguration('tokguess')
          .get('codelens.warningThreshold', 2000);
        this._onDidChangeCodeLenses.fire();
      }
    });
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (!this.enabled) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const languageId = document.languageId;

    // Skip for very large files (performance)
    if (text.length > 500000) {
      return lenses;
    }

    // Parse functions/classes based on language
    const blocks = this.extractCodeBlocks(text, languageId);

    for (const block of blocks) {
      const tokens = estimateTokensFromText(block.text);
      const range = new vscode.Range(
        document.positionAt(block.start),
        document.positionAt(block.start)
      );

      const isHeavy = tokens > this.warningThreshold;
      const icon = isHeavy ? '⚠️' : '💎';
      const label = `${icon} ~${tokens.toLocaleString()} tokens`;

      const lens = new vscode.CodeLens(range, {
        title: label,
        command: 'tokguess.showBlockInfo',
        tooltip: isHeavy
          ? `High token count! Consider splitting this ${block.type}`
          : `Estimated tokens for this ${block.type}`,
        arguments: [block, tokens]
      });

      lenses.push(lens);
    }

    return lenses;
  }

  /**
   * Extract code blocks (functions, classes, methods) from text
   */
  private extractCodeBlocks(
    text: string,
    languageId: string
  ): Array<{ type: string; name: string; start: number; end: number; text: string }> {
    const blocks: Array<{
      type: string;
      name: string;
      start: number;
      end: number;
      text: string;
    }> = [];

    let patterns: RegExp[] = [];

    // Language-specific patterns
    switch (languageId) {
      case 'typescript':
      case 'javascript':
      case 'typescriptreact':
      case 'javascriptreact':
        patterns = [
          // Functions: function name() { }
          /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g,
          // Arrow functions: const name = () => { }
          /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g,
          // Classes: class Name { }
          /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g,
          // Methods: methodName() { }
          /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm
        ];
        break;

      case 'python':
        patterns = [
          // Functions: def name():
          /^(?:\s*)def\s+(\w+)\s*\([^)]*\):/gm,
          // Classes: class Name:
          /^(?:\s*)class\s+(\w+)(?:\([^)]*\))?:/gm
        ];
        break;

      case 'go':
        patterns = [
          // Functions: func name() { }
          /func\s+(?:\([^)]*\)\s+)?(\w+)\s*\([^)]*\)(?:\s*[^{]*)?\s*\{/g
        ];
        break;

      case 'rust':
        patterns = [
          // Functions: fn name() { }
          /(?:pub\s+)?fn\s+(\w+)(?:<[^>]+>)?\s*\([^)]*\)(?:\s*->\s*[^{]*)?\s*\{/g,
          // Structs: struct Name { }
          /(?:pub\s+)?struct\s+(\w+)(?:<[^>]+>)?\s*\{/g
        ];
        break;

      case 'java':
      case 'csharp':
        patterns = [
          // Methods: public type name() { }
          /(?:public|private|protected)\s+(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\([^)]*\)\s*\{/g,
          // Classes: class Name { }
          /(?:public|private)\s+class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/g
        ];
        break;

      default:
        // Generic fallback: look for function-like patterns
        patterns = [/(?:function|def|func|fn)\s+(\w+)\s*\([^)]*\)\s*[{:]/g];
    }

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const start = match.index;
        const name = match[1] || 'anonymous';

        // Find matching closing brace
        const end = this.findBlockEnd(text, start, languageId);
        if (end === -1) {
          continue;
        }

        const blockText = text.substring(start, end);
        const type = this.inferBlockType(match[0]);

        blocks.push({
          type,
          name,
          start,
          end,
          text: blockText
        });
      }
    }

    // Sort by position and deduplicate overlaps
    blocks.sort((a, b) => a.start - b.start);
    const deduped: typeof blocks = [];
    let lastEnd = -1;

    for (const block of blocks) {
      if (block.start >= lastEnd) {
        deduped.push(block);
        lastEnd = block.end;
      }
    }

    return deduped;
  }

  /**
   * Find the end of a code block by matching braces/indentation
   */
  private findBlockEnd(text: string, start: number, languageId: string): number {
    const useBraces = !['python', 'yaml', 'yml'].includes(languageId);

    if (useBraces) {
      // Match braces
      let depth = 0;
      let foundOpen = false;

      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') {
          depth++;
          foundOpen = true;
        } else if (text[i] === '}') {
          depth--;
          if (foundOpen && depth === 0) {
            return i + 1;
          }
        }
      }
    } else {
      // Python: use indentation
      const lines = text.substring(start).split('\n');
      if (lines.length === 0) {
        return -1;
      }

      const firstLine = lines[0];
      const baseIndent = firstLine.match(/^\s*/)?.[0].length || 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
          continue; // Skip empty lines
        }
        const indent = line.match(/^\s*/)?.[0].length || 0;
        if (indent <= baseIndent) {
          // Found end of block
          const lineStart = lines.slice(0, i).join('\n').length;
          return start + lineStart;
        }
      }
    }

    return -1; // Not found
  }

  /**
   * Infer block type from pattern match
   */
  private inferBlockType(matchText: string): string {
    if (matchText.includes('class')) {
      return 'class';
    }
    if (matchText.includes('struct')) {
      return 'struct';
    }
    return 'function';
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
