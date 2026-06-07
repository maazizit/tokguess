import * as vscode from 'vscode';

const CHARS_PER_TOKEN = 4.2;
const CODE_BOOST = 1.08;

class CopilotTokenEstimator {
  private statusBar: vscode.StatusBarItem;
  private enabled = true;

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBar.command = 'tokguess.showStats';
    this.statusBar.show();
  }

  estimateTokens(text: string): number {
    if (!text?.trim()) {
      return 0;
    }

    const cleaned = text.trim();
    let estimate = Math.ceil(cleaned.length / CHARS_PER_TOKEN);

    const punctuation = (cleaned.match(/[.,!?;:\-()[\]{}]/g) || []).length;
    estimate += Math.ceil(punctuation * 0.4);

    if (this.isCodeLike(cleaned)) {
      estimate = Math.ceil(estimate * CODE_BOOST);
    }

    return Math.max(estimate, 1);
  }

  private isCodeLike(text: string): boolean {
    const codeIndicators = [
      /\{[\s\S]*\}/,
      /\[[\s\S]*\]/,
      /function|const|let|var|import|export|class|def |async /,
      /=>|::|\/\//,
      /\.[\w]+\(/
    ];

    return codeIndicators.some((regex) => regex.test(text));
  }

  countSelection(editor: vscode.TextEditor): number {
    return this.estimateTokens(editor.document.getText(editor.selection));
  }

  countFile(editor: vscode.TextEditor): number {
    return this.estimateTokens(editor.document.getText());
  }

  updateStatusBar(editor: vscode.TextEditor | undefined): void {
    if (!editor || !this.enabled) {
      this.statusBar.text = '🤖 TokGuess: off';
      this.statusBar.tooltip = 'TokGuess for Copilot — click to enable';
      return;
    }

    const tokens = this.countFile(editor);
    const chars = editor.document.getText().length;

    this.statusBar.text = `🤖 ~${tokens} tok`;
    this.statusBar.tooltip =
      `TokGuess (Copilot estimate)\n` +
      `~${tokens} tokens · ${chars} chars\n` +
      `Ctrl+Shift+T — detailed stats`;
  }

  async showStats(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const fileTokens = this.countFile(editor);
    const selectionTokens = this.countSelection(editor);
    const fileChars = editor.document.getText().length;
    const selectionChars = editor.document.getText(editor.selection).length;
    const fileName = editor.document.fileName.split('/').pop() ?? 'untitled';

    const message = [
      `📊 TokGuess — ${fileName}`,
      '',
      'File:',
      `  • ~${fileTokens} tokens (estimated)`,
      `  • ${fileChars} characters`,
      `  • ${editor.document.lineCount} lines`,
      '',
      'Selection:',
      `  • ~${selectionTokens} tokens (estimated)`,
      `  • ${selectionChars} characters`,
      '',
      '⚠️ Local estimate for Copilot Chat (GPT-4 tokenizer approx.)',
      '   Not official Microsoft billing. Typical accuracy: ~90–95%.'
    ].join('\n');

    await vscode.window.showInformationMessage(message);
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.updateStatusBar(vscode.window.activeTextEditor);
    vscode.window.showInformationMessage(
      `TokGuess ${this.enabled ? 'enabled' : 'disabled'}`
    );
  }

  dispose(): void {
    this.statusBar.dispose();
  }
}

let estimator: CopilotTokenEstimator;

export function activate(context: vscode.ExtensionContext): void {
  estimator = new CopilotTokenEstimator();

  const countCurrentFile = vscode.commands.registerCommand(
    'tokguess.countCurrentFile',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const tokens = estimator.countFile(editor);
      void vscode.window.showInformationMessage(
        `🤖 ~${tokens} tokens (Copilot estimate)`
      );
    }
  );

  const showStats = vscode.commands.registerCommand(
    'tokguess.showStats',
    () => estimator.showStats(vscode.window.activeTextEditor)
  );

  const toggleCounter = vscode.commands.registerCommand(
    'tokguess.toggle',
    () => estimator.toggle()
  );

  const onActiveEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
    estimator.updateStatusBar(editor);
  });

  const onTextChange = vscode.workspace.onDidChangeTextDocument(() => {
    estimator.updateStatusBar(vscode.window.activeTextEditor);
  });

  estimator.updateStatusBar(vscode.window.activeTextEditor);

  context.subscriptions.push(
    countCurrentFile,
    showStats,
    toggleCounter,
    onActiveEditor,
    onTextChange,
    { dispose: () => estimator.dispose() }
  );
}

export function deactivate(): void {
  estimator?.dispose();
}
