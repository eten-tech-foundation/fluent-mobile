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
 * Paragraphs and list items become newlines; bullets are preserved as `• `.
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
  if (node.type === 'paragraph' || node.type === 'heading') {
    return parts.join('').trim();
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return parts.filter(Boolean).join('\n');
  }
  if (node.type === 'listItem') {
    const text = parts
      .join('\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join(' ');
    return text ? `• ${text}` : '';
  }
  return parts.join('');
}
