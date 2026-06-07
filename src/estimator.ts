const CHARS_PER_TOKEN = 4.2;
const CODE_BOOST = 1.08;

export function estimateTokensFromText(text: string): number {
  if (!text?.trim()) {
    return 0;
  }

  const cleaned = text.trim();
  let estimate = Math.ceil(cleaned.length / CHARS_PER_TOKEN);
  const punctuation = (cleaned.match(/[.,!?;:\-()[\]{}]/g) || []).length;
  estimate += Math.ceil(punctuation * 0.4);

  if (isCodeLike(cleaned)) {
    estimate = Math.ceil(estimate * CODE_BOOST);
  }

  return Math.max(estimate, 1);
}

function isCodeLike(text: string): boolean {
  return [
    /\{[\s\S]*\}/,
    /function|const|let|var|import|export|class|def |async /,
    /=>|::|\/\//,
    /\.[\w]+\(/
  ].some((regex) => regex.test(text));
}
