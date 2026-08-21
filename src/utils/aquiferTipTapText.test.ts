import { tipTapToPlainText } from './aquiferTipTapText';

describe('tipTapToPlainText', () => {
  it('flattens a TQ-style doc into question and answer lines', () => {
    const text = tipTapToPlainText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [{ type: 'bold' }],
              text: 'Why did they wait?',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'They feared a riot.' }],
        },
      ],
    });

    expect(text).toBe('Why did they wait?\nThey feared a riot.');
  });

  it('preserves bullet list items as separate lines', () => {
    const text = tipTapToPlainText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Key points:' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'First item' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Second item' }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(text).toBe('Key points:\n• First item\n• Second item');
  });

  it('returns empty string for unknown shapes', () => {
    expect(tipTapToPlainText(null)).toBe('');
    expect(tipTapToPlainText('plain')).toBe('');
  });
});
