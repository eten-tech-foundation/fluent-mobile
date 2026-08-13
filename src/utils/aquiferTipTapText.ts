type TipTapLike = {
  type?: string;
  text?: string;
  content?: TipTapLike[];
};

function isTipTapLike(value: unknown): value is TipTapLike {
  return typeof value === 'object' && value !== null;
}

/**
 * Flatten Aquifer TipTap JSON to plain text for mobile Resources accordions.
 * Paragraphs become newlines; nested text nodes are concatenated.
 */
export function tipTapToPlainText(node: unknown): string {
  if (!isTipTapLike(node)) {
    return '';
  }

  if (typeof node.text === 'string') {
    return node.text;
  }

  if (!Array.isArray(node.content) || node.content.length === 0) {
    return '';
  }

  const parts = node.content.map(child => tipTapToPlainText(child));
  if (node.type === 'doc') {
    return parts.filter(Boolean).join('\n').trim();
  }
  if (node.type === 'paragraph') {
    return parts.join('').trim();
  }
  return parts.join('');
}
