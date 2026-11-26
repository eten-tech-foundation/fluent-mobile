import { act, renderHook, waitFor } from '@testing-library/react-native';
import { FluentAPI } from '../../../../services/api';
import {
  findDownloadedRows,
  readDownloadedJson,
} from '../../../../services/offlineResources';
import type { ApiTranslationQuestionItem } from '../../../../types/api/translationResources';
import type { DownloadQueueItem } from '../../../../types/download/types';
import type { ResourceSectionId } from '../../../../types/resources/types';
import {
  usePassageQuestions,
  type PassageQuestionsState,
} from './usePassageQuestions';
import type { Ready } from './ready';

let mockConnectivity = { isOnline: true, hasResolved: true };
let mockDownloadedSections: ResourceSectionId[] = [];

jest.mock('../../../../hooks/useConnectivity', () => ({
  useConnectivity: () => mockConnectivity,
}));

jest.mock('../../../../hooks/useResourcesInventory', () => ({
  useResourcesInventory: () => ({
    inventoryVersion: 0,
    downloadedSections: mockDownloadedSections,
    getResourceStatus: () => 'available',
  }),
}));

jest.mock('../../../../services/api', () => ({
  FluentAPI: { getTranslationQuestions: jest.fn() },
}));

jest.mock('../../../../services/offlineResources', () => ({
  findDownloadedRows: jest.fn(),
  readDownloadedJson: jest.fn(),
}));

const getQuestions = FluentAPI.getTranslationQuestions as jest.MockedFunction<
  typeof FluentAPI.getTranslationQuestions
>;
const mockFindRows = findDownloadedRows as jest.MockedFunction<
  typeof findDownloadedRows
>;
const mockReadJson = readDownloadedJson as jest.MockedFunction<
  typeof readDownloadedJson
>;

function tipTap(question: string, answer: string) {
  return {
    tiptap: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: question }] },
        { type: 'paragraph', content: [{ type: 'text', text: answer }] },
      ],
    },
  };
}

function item(
  id: number,
  question: string,
  answer: string,
): ApiTranslationQuestionItem {
  return {
    id,
    name: `Item ${id}`,
    localizedName: `Item ${id}`,
    content: [tipTap(question, answer)],
  } as ApiTranslationQuestionItem;
}

function response(...items: ApiTranslationQuestionItem[]) {
  return { items } as unknown as Awaited<
    ReturnType<typeof FluentAPI.getTranslationQuestions>
  >;
}

function passage(
  verses: { chapterNumber: number; verseNumber: number }[],
  overrides: Partial<Ready['assignment']> = {},
): Ready {
  return {
    assignment: {
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      sourceLanguageCode: 'eng',
      ...overrides,
    },
    verses,
  } as unknown as Ready;
}

const PERICOPE = passage([
  { chapterNumber: 14, verseNumber: 1 },
  { chapterNumber: 14, verseNumber: 2 },
]);

type Props = {
  passage: Ready;
  userId: number | null;
  verse: number | null;
  enabled: boolean;
};

/** Every state rendered, so a stale one can't hide between renders. */
async function renderQuestions(initial: Partial<Props> = {}) {
  const seen: PassageQuestionsState[] = [];
  const view = await renderHook(
    (props: Props) => {
      const result = usePassageQuestions(props);
      seen.push(result.state);
      return result;
    },
    {
      initialProps: {
        passage: PERICOPE,
        userId: 5,
        verse: null,
        enabled: true,
        ...initial,
      },
    },
  );
  return { ...view, seen };
}

function questionTexts(state: PassageQuestionsState) {
  return state.status === 'ready' ? state.questions.map(q => q.question) : [];
}

describe('usePassageQuestions', () => {
  beforeEach(() => {
    mockConnectivity = { isOnline: true, hasResolved: true };
    mockDownloadedSections = [];
    getQuestions.mockReset();
    mockFindRows.mockReset();
    mockReadJson.mockReset();
    mockFindRows.mockResolvedValue(null);
  });

  it('stays loading without asking anything while connectivity is unresolved', async () => {
    mockConnectivity = { isOnline: false, hasResolved: false };
    const { result } = await renderQuestions();
    await act(async () => {});
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(mockFindRows).not.toHaveBeenCalled();
    expect(getQuestions).not.toHaveBeenCalled();
  });

  it('does not load until asked', async () => {
    const { result, rerender } = await renderQuestions({ enabled: false });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(getQuestions).not.toHaveBeenCalled();

    getQuestions.mockResolvedValue(response(item(1, 'Who?', 'Jesus.')));
    await rerender({
      passage: PERICOPE,
      userId: 5,
      verse: null,
      enabled: true,
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });

  it('asks for every verse in a pericope, in order and without duplicates', async () => {
    getQuestions.mockImplementation(async (_p, _b, _c, verse) =>
      verse === 1
        ? response(item(1, 'Who came?', 'The priests.'))
        : response(
            item(1, 'Who came?', 'The priests.'),
            item(2, 'Why wait?', 'A riot.'),
          ),
    );
    const { result } = await renderQuestions();
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(getQuestions.mock.calls).toEqual([
      [7, 'MRK', 14, 1, 'eng'],
      [7, 'MRK', 14, 2, 'eng'],
    ]);
    expect(result.current.state).toEqual({
      status: 'ready',
      questions: [
        { id: 'tq-api-1-0', question: 'Who came?', answer: 'The priests.' },
        { id: 'tq-api-2-0', question: 'Why wait?', answer: 'A riot.' },
      ],
    });
  });

  it('keeps each chapter of a cross-chapter passage with its own verses', async () => {
    getQuestions.mockResolvedValue(response());
    const { result } = await renderQuestions({
      passage: passage([
        { chapterNumber: 14, verseNumber: 72 },
        { chapterNumber: 15, verseNumber: 1 },
      ]),
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(getQuestions.mock.calls).toEqual([
      [7, 'MRK', 14, 72, 'eng'],
      [7, 'MRK', 15, 1, 'eng'],
    ]);
  });

  it("asks only for verse mode's verse", async () => {
    getQuestions.mockResolvedValue(response(item(2, 'Why wait?', 'A riot.')));
    const { result } = await renderQuestions({ verse: 2 });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(getQuestions.mock.calls).toEqual([[7, 'MRK', 14, 2, 'eng']]);
  });

  it('reads prepared questions offline without calling the API', async () => {
    mockConnectivity = { isOnline: false, hasResolved: true };
    mockDownloadedSections = ['translationQuestions'];
    mockFindRows.mockResolvedValue([
      {
        id: 'row-1',
        resourceId: 'r-1',
        label: 'Mark 14:1',
      } as unknown as DownloadQueueItem,
    ]);
    mockReadJson.mockResolvedValue([tipTap('Who came?', 'The priests.')]);
    const { result } = await renderQuestions();
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(questionTexts(result.current.state)).toEqual(['Who came?']);
    expect(mockFindRows).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 7,
        userId: 5,
        resourceName: 'Translation Questions',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    );
    expect(getQuestions).not.toHaveBeenCalled();
  });

  it('says offline questions were never prepared, apart from an empty passage', async () => {
    mockConnectivity = { isOnline: false, hasResolved: true };
    const { result, rerender } = await renderQuestions();
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'unprepared' }),
    );

    mockDownloadedSections = ['translationQuestions'];
    await rerender({
      passage: PERICOPE,
      userId: 5,
      verse: null,
      enabled: true,
    });
    expect(result.current.state).toEqual({ status: 'ready', questions: [] });
    expect(getQuestions).not.toHaveBeenCalled();
  });

  it("asks nothing for a whole chapter whose text isn't here yet", async () => {
    getQuestions.mockResolvedValue(response(item(1, 'Verse one?', 'No.')));
    const { result } = await renderQuestions({ passage: passage([]) });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: 'noVerses' });
    expect(getQuestions).not.toHaveBeenCalled();
    expect(mockFindRows).not.toHaveBeenCalled();
  });

  it('is empty, not unprepared, offline without a project', async () => {
    mockConnectivity = { isOnline: false, hasResolved: true };
    const { result } = await renderQuestions({
      passage: passage(PERICOPE.verses, { projectId: null }),
    });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', questions: [] }),
    );
  });

  it('is empty, not unprepared, online with nothing for the passage', async () => {
    getQuestions.mockResolvedValue(response());
    const { result } = await renderQuestions();
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', questions: [] }),
    );
  });

  it('fails on its own and Retry recovers in place', async () => {
    getQuestions.mockRejectedValue(new Error('offline'));
    const { result } = await renderQuestions({ verse: 2 });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'failed' }),
    );

    getQuestions.mockReset();
    getQuestions.mockResolvedValue(response(item(2, 'Why wait?', 'A riot.')));
    await act(async () => {
      await result.current.retry();
    });
    expect(questionTexts(result.current.state)).toEqual(['Why wait?']);
    expect(getQuestions).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['account', { userId: 6 }],
    [
      'language',
      { passage: passage(PERICOPE.verses, { sourceLanguageCode: 'spa' }) },
    ],
    ['project', { passage: passage(PERICOPE.verses, { projectId: 8 }) }],
    ['verse', { verse: 2 }],
  ] as const)(
    'never shows the old questions after a %s switch',
    async (_name, change) => {
      getQuestions.mockResolvedValue(response(item(1, 'Old?', 'Old.')));
      const { result, rerender, seen } = await renderQuestions();
      await waitFor(() =>
        expect(questionTexts(result.current.state)).toEqual(['Old?']),
      );
      const before = result.current.scope;

      const pending: ((value: ReturnType<typeof response>) => void)[] = [];
      getQuestions.mockImplementation(
        () => new Promise(resolve => pending.push(resolve)),
      );
      const from = seen.length;
      await rerender({
        passage: PERICOPE,
        userId: 5,
        verse: null,
        enabled: true,
        ...change,
      });
      expect(result.current.scope).not.toBe(before);
      expect(seen.slice(from).flatMap(questionTexts)).not.toContain('Old?');
      await waitFor(() => expect(pending.length).toBeGreaterThan(0));
      await act(async () => {
        pending.forEach(resolve => resolve(response(item(3, 'New?', 'New.'))));
      });
      await waitFor(() =>
        expect(questionTexts(result.current.state)).toEqual(['New?']),
      );
    },
  );

  it('drops a response that arrives after the account changed', async () => {
    const pending: ((value: ReturnType<typeof response>) => void)[] = [];
    getQuestions.mockImplementation(
      () => new Promise(resolve => pending.push(resolve)),
    );
    const { result, rerender, seen } = await renderQuestions({ verse: 1 });
    await waitFor(() => expect(pending).toHaveLength(1));

    await rerender({ passage: PERICOPE, userId: 6, verse: 1, enabled: true });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => {
      pending[0]!(response(item(1, 'For five?', 'No.')));
    });
    expect(seen.flatMap(questionTexts)).not.toContain('For five?');
    expect(result.current.state).toEqual({ status: 'loading' });

    await act(async () => {
      pending[1]!(response(item(2, 'For six?', 'Yes.')));
    });
    expect(questionTexts(result.current.state)).toEqual(['For six?']);
  });
});
