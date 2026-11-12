import type { ApiTranslationNoteItem } from '../types/api/translationResources';
import {
  loadTranslationNotesForUnit,
  mergeTranslationNotesRetry,
  parseTranslationNotesItem,
  TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT,
  type LoadTranslationNotesParams,
  setTranslationNotesLoadFailureForTests,
} from './translationNotes';
import { FluentAPI } from './api';
import { ApiError } from './apiError';
import { findDownloadedRows, readDownloadedJson } from './offlineResources';
import { clearPassageResourceReuse } from './passageResourceReuse';
import type { DownloadQueueItem } from '../types/download/types';
import { authToken } from './authToken';

let mockActiveUserId = '';
jest.mock('./storage', () => ({
  getActiveUserId: () => mockActiveUserId,
}));

/** As accountSession does on a switch: the account is active, its bearer live. */
function switchAccount(userId: string, token: string | null): void {
  mockActiveUserId = userId;
  authToken.set(token);
}

jest.mock('./api', () => ({
  FluentAPI: {
    getTranslationNotes: jest.fn(),
  },
}));

jest.mock('./offlineResources', () => ({
  findDownloadedRows: jest.fn(),
  readDownloadedJson: jest.fn(),
}));

const mockFindRows = findDownloadedRows as jest.MockedFunction<
  typeof findDownloadedRows
>;
const mockReadJson = readDownloadedJson as jest.MockedFunction<
  typeof readDownloadedJson
>;

const getTranslationNotes =
  FluentAPI.getTranslationNotes as jest.MockedFunction<
    typeof FluentAPI.getTranslationNotes
  >;

function downloadedRow(
  overrides: Partial<DownloadQueueItem> = {},
): DownloadQueueItem {
  return {
    id: '42-7-tn-mrk-14-2',
    tier: 1,
    label: 'Mark 14:2',
    progress: 1,
    status: 'completed',
    ...overrides,
  };
}

const sampleItem: ApiTranslationNoteItem = {
  id: 12345,
  name: 'Mark 14:2',
  localizedName: 'Mark 14:2',
  content: [
    {
      tiptap: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'connecting word' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'This phrase connects the current verse to the previous one.',
              },
            ],
          },
        ],
      },
    },
  ],
};

describe('parseTranslationNotesItem', () => {
  it('maps TipTap content to note title/body', () => {
    expect(parseTranslationNotesItem(sampleItem)).toEqual([
      {
        id: 'tn-api-12345-0',
        title: 'Mark 14:2',
        body: 'connecting word\nThis phrase connects the current verse to the previous one.',
        quote: 'connecting word',
      },
    ]);
  });
});

const loadNotes = async (params: LoadTranslationNotesParams) =>
  (await loadTranslationNotesForUnit(params)).notes;

describe('loadTranslationNotesForUnit', () => {
  beforeEach(() => {
    clearPassageResourceReuse();
    switchAccount('', null);
    // Default: nothing downloaded → the API path is exercised.
    mockFindRows.mockResolvedValue(null);
  });

  afterEach(() => {
    setTranslationNotesLoadFailureForTests(false);
    getTranslationNotes.mockReset();
    mockFindRows.mockReset();
    mockReadJson.mockReset();
  });

  it('returns [] when projectId is null', async () => {
    await expect(
      loadNotes({
        projectId: null,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationNotes).not.toHaveBeenCalled();
  });

  it('returns [] when bookCode is missing', async () => {
    await expect(
      loadNotes({
        projectId: 7,
        bookCode: '  ',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
    expect(getTranslationNotes).not.toHaveBeenCalled();
  });

  it('returns [] when API has no TN for the unit', async () => {
    getTranslationNotes.mockResolvedValue({ items: [] });

    await expect(
      loadNotes({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('returns [] when API payload omits items', async () => {
    getTranslationNotes.mockResolvedValue({} as never);

    await expect(
      loadNotes({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    ).resolves.toEqual([]);
  });

  it('reports a failed verse so the section can show retry', async () => {
    getTranslationNotes.mockRejectedValue(
      new ApiError(502, 'Aquifer service is unavailable'),
    );

    await expect(
      loadTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).resolves.toMatchObject({
      notes: [],
      succeededRefs: [],
      failedRefs: [{ chapterNumber: 14, verseNumber: 2 }],
      unavailableOfflineRefs: [],
    });
  });

  it('calls FluentAPI and parses resource items', async () => {
    getTranslationNotes.mockResolvedValue({ items: [sampleItem] });

    await expect(
      loadNotes({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).resolves.toEqual([
      {
        id: 'tn-api-12345-0',
        title: 'Mark 14:2',
        body: 'connecting word\nThis phrase connects the current verse to the previous one.',
        quote: 'connecting word',
        verse: { chapterNumber: 14, verseNumber: 2 },
      },
    ]);

    expect(getTranslationNotes).toHaveBeenCalledWith(
      7,
      'MRK',
      14,
      2,
      'eng',
      undefined,
    );
  });

  it('fans out across verseNumbers and dedupes by id (#593)', async () => {
    getTranslationNotes.mockImplementation(async (_p, _b, _c, verse) => ({
      items: [
        {
          ...sampleItem,
          id: verse === 1 ? 111 : 222,
          localizedName: `Mark 14:${verse}`,
          name: `Mark 14:${verse}`,
        },
      ],
    }));

    const notes = await loadNotes({
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 1,
      verseNumbers: [1, 2],
    });

    expect(getTranslationNotes).toHaveBeenCalledTimes(2);
    expect(notes.map(n => n.id)).toEqual(['tn-api-111-0', 'tn-api-222-0']);
  });

  it('throws when failure injection is enabled', async () => {
    setTranslationNotesLoadFailureForTests(true);
    await expect(
      loadNotes({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    ).rejects.toThrow(/Failed to load Translation Notes/);
  });

  describe('download-first', () => {
    beforeEach(() => {
      switchAccount('42', 'token-42');
    });

    it('uses downloaded rows and skips the API, even when online', async () => {
      mockFindRows.mockResolvedValue([
        downloadedRow({ localFilePath: 'file:///downloads/tn.json' }),
      ]);
      mockReadJson.mockResolvedValue(sampleItem.content);
      getTranslationNotes.mockResolvedValue({ items: [sampleItem] });

      await expect(
        loadNotes({
          projectId: 7,
          userId: 42,
          isOnline: true,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([
        {
          id: 'tn-api-42-7-tn-mrk-14-2-0',
          title: 'Mark 14:2',
          body: 'connecting word\nThis phrase connects the current verse to the previous one.',
          quote: 'connecting word',
          verse: { chapterNumber: 14, verseNumber: 2 },
        },
      ]);
      expect(getTranslationNotes).not.toHaveBeenCalled();
    });

    it('falls back to the API when nothing is downloaded and online', async () => {
      mockFindRows.mockResolvedValue(null);
      getTranslationNotes.mockResolvedValue({ items: [sampleItem] });

      await expect(
        loadNotes({
          projectId: 7,
          userId: 42,
          isOnline: true,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([
        {
          id: 'tn-api-12345-0',
          title: 'Mark 14:2',
          body: 'connecting word\nThis phrase connects the current verse to the previous one.',
          quote: 'connecting word',
          verse: { chapterNumber: 14, verseNumber: 2 },
        },
      ]);
      expect(getTranslationNotes).toHaveBeenCalledTimes(1);
    });

    it('returns empty offline when nothing is downloaded (#578)', async () => {
      mockFindRows.mockResolvedValue(null);

      await expect(
        loadNotes({
          projectId: 7,
          userId: 42,
          isOnline: false,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([]);
      expect(getTranslationNotes).not.toHaveBeenCalled();
    });

    it('falls back to the API when every downloaded file is unreadable', async () => {
      mockFindRows.mockResolvedValue([
        downloadedRow({ localFilePath: 'file:///downloads/tn.json' }),
      ]);
      mockReadJson.mockResolvedValue(undefined);
      getTranslationNotes.mockResolvedValue({ items: [sampleItem] });

      await expect(
        loadNotes({
          projectId: 7,
          userId: 42,
          isOnline: true,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([
        {
          id: 'tn-api-12345-0',
          title: 'Mark 14:2',
          body: 'connecting word\nThis phrase connects the current verse to the previous one.',
          quote: 'connecting word',
          verse: { chapterNumber: 14, verseNumber: 2 },
        },
      ]);
      expect(getTranslationNotes).toHaveBeenCalledTimes(1);
    });

    it('does not call the API offline when a downloaded row exists but its file is unreadable', async () => {
      mockFindRows.mockResolvedValue([
        downloadedRow({ localFilePath: 'file:///downloads/tn.json' }),
      ]);
      mockReadJson.mockResolvedValue(undefined);

      await expect(
        loadNotes({
          projectId: 7,
          userId: 42,
          isOnline: false,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        }),
      ).resolves.toEqual([]);
      expect(getTranslationNotes).not.toHaveBeenCalled();
    });

    it('loads local rows for every verseRef and only calls API for missing refs', async () => {
      mockFindRows.mockImplementation(async query => {
        if (query.verseNumber === 1) {
          return [
            downloadedRow({
              id: '42-7-tn-mrk-14-1',
              resourceId: 'local-v1',
              label: 'Mark 14:1',
              localFilePath: 'file:///downloads/tn-1.json',
            }),
          ];
        }
        return null;
      });
      mockReadJson.mockResolvedValue([
        {
          tiptap: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'local note for v1' }],
              },
            ],
          },
        },
      ]);
      getTranslationNotes.mockResolvedValue({
        items: [
          {
            ...sampleItem,
            id: 222,
            name: 'Mark 14:2',
            localizedName: 'Mark 14:2',
          },
        ],
      });

      const notes = await loadNotes({
        projectId: 7,
        userId: 42,
        isOnline: true,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
        verseRefs: [
          { chapterNumber: 14, verseNumber: 1 },
          { chapterNumber: 14, verseNumber: 2 },
        ],
      });

      expect(mockFindRows).toHaveBeenCalledTimes(2);
      expect(getTranslationNotes).toHaveBeenCalledTimes(1);
      expect(getTranslationNotes).toHaveBeenCalledWith(
        7,
        'MRK',
        14,
        2,
        'eng',
        'token-42',
      );
      expect(notes.map(n => n.id)).toEqual([
        'tn-api-local-v1-0',
        'tn-api-222-0',
      ]);
    });

    it('returns downloaded pericope notes offline without API fan-out', async () => {
      mockFindRows.mockImplementation(async query => {
        if (query.verseNumber === 1) {
          return [
            downloadedRow({
              id: '42-7-tn-mrk-14-1',
              resourceId: 'local-v1',
              label: 'Mark 14:1',
              localFilePath: 'file:///downloads/tn-1.json',
            }),
          ];
        }
        return null;
      });
      mockReadJson.mockResolvedValue([
        {
          tiptap: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'local note for v1' }],
              },
            ],
          },
        },
      ]);

      const notes = await loadNotes({
        projectId: 7,
        userId: 42,
        isOnline: false,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
        verseRefs: [
          { chapterNumber: 14, verseNumber: 1 },
          { chapterNumber: 14, verseNumber: 2 },
        ],
      });

      expect(notes.map(n => n.id)).toEqual(['tn-api-local-v1-0']);
      expect(getTranslationNotes).not.toHaveBeenCalled();
    });
  });

  describe('reopening the passage', () => {
    beforeEach(() => {
      switchAccount('42', 'token-42');
    });

    const unit = {
      projectId: 7,
      userId: 42,
      isOnline: true,
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 1,
      verseRefs: [
        { chapterNumber: 14, verseNumber: 1 },
        { chapterNumber: 14, verseNumber: 2 },
      ],
    };

    it("reuses each verse's answer, empty ones too, instead of asking again", async () => {
      getTranslationNotes.mockImplementation(async (_p, _b, _c, verse) =>
        verse === 2 ? { items: [sampleItem] } : { items: [] },
      );
      const first = await loadNotes(unit);
      const second = await loadNotes(unit);
      expect(second).toEqual(first);
      expect(first).toHaveLength(1);
      expect(getTranslationNotes).toHaveBeenCalledTimes(2);
    });

    it('asks again for a verse that failed, an explicit refresh, or another account', async () => {
      getTranslationNotes.mockImplementation(async (_p, _b, _c, verse) => {
        if (verse === 2) throw new Error('502');
        return { items: [] };
      });
      await loadNotes(unit);
      expect(getTranslationNotes).toHaveBeenCalledTimes(2);

      getTranslationNotes.mockResolvedValue({ items: [sampleItem] });
      await expect(loadNotes(unit)).resolves.toHaveLength(1);
      expect(getTranslationNotes).toHaveBeenCalledTimes(3);
      expect(getTranslationNotes).toHaveBeenLastCalledWith(
        7,
        'MRK',
        14,
        2,
        'eng',
        'token-42',
      );

      await loadNotes({ ...unit, refresh: true });
      expect(getTranslationNotes).toHaveBeenCalledTimes(5);

      switchAccount('43', 'token-43');
      await loadNotes({ ...unit, userId: 43 });
      expect(getTranslationNotes).toHaveBeenCalledTimes(7);
    });

    it('asks again in another language', async () => {
      getTranslationNotes.mockResolvedValue({ items: [] });
      await loadNotes(unit);
      await loadNotes({ ...unit, languageCode: 'spa' });
      expect(getTranslationNotes).toHaveBeenCalledTimes(4);
    });

    it('still prefers a row downloaded since the first open', async () => {
      getTranslationNotes.mockResolvedValue({ items: [] });
      await loadNotes(unit);
      mockFindRows.mockResolvedValue([
        downloadedRow({ localFilePath: 'file:///downloads/tn.json' }),
      ]);
      mockReadJson.mockResolvedValue(sampleItem.content);
      const notes = await loadNotes(unit);
      expect(notes.length).toBeGreaterThan(0);
      expect(getTranslationNotes).toHaveBeenCalledTimes(2);
    });

    it("never fetches A's notes with B's bearer when the switch lands during A's local lookup", async () => {
      const verse = {
        ...unit,
        verseRefs: [{ chapterNumber: 14, verseNumber: 2 }],
      };
      const bearers: (string | null)[] = [];
      // As httpClient.buildHeaders: an explicit token wins over the global one.
      getTranslationNotes.mockImplementation(
        async (_p, _b, _c, _v, _l, token) => {
          const bearer = token ?? authToken.get();
          bearers.push(bearer);
          return {
            items: [{ ...sampleItem, id: bearer === 'token-a' ? 1 : 2 }],
          };
        },
      );
      switchAccount('42', 'token-a');
      let missLocally!: (rows: null) => void;
      mockFindRows.mockReturnValueOnce(
        new Promise(resolve => {
          missLocally = resolve;
        }),
      );
      const stale = loadNotes(verse);
      await Promise.resolve();

      // An account switch lands while A's local lookup is still out.
      switchAccount('43', 'token-b');
      missLocally(null);
      await stale.catch(() => undefined);
      expect(bearers).not.toContain('token-b');

      switchAccount('42', 'token-a');
      const notes = await loadNotes(verse);
      expect(bearers).toEqual(['token-a']);
      expect(notes.every(note => note.id.startsWith('tn-api-1-'))).toBe(true);
    });

    it("never asks as B, or keeps B's notes, for A's passage still mounted after the switch", async () => {
      const verse = {
        ...unit,
        verseRefs: [{ chapterNumber: 14, verseNumber: 2 }],
      };
      const bearers: (string | null)[] = [];
      getTranslationNotes.mockImplementation(
        async (_p, _b, _c, _v, _l, token) => {
          const bearer = token ?? authToken.get();
          bearers.push(bearer);
          return {
            items: [{ ...sampleItem, id: bearer === 'token-a' ? 1 : 2 }],
          };
        },
      );
      // B is active before A's passage props have caught up.
      switchAccount('43', 'token-b');
      await expect(loadNotes(verse)).rejects.toThrow(/not the active session/);
      expect(bearers).toEqual([]);

      switchAccount('42', 'token-a');
      const notes = await loadNotes(verse);
      expect(bearers).toEqual(['token-a']);
      expect(notes.every(note => note.id.startsWith('tn-api-1-'))).toBe(true);
    });

    it("never sends a load begun without a token with the next account's token", async () => {
      const verse = {
        ...unit,
        verseRefs: [{ chapterNumber: 14, verseNumber: 2 }],
      };
      const bearers: (string | null)[] = [];
      getTranslationNotes.mockImplementation(
        async (_p, _b, _c, _v, _l, token) => {
          bearers.push(token ?? authToken.get());
          return { items: [sampleItem] };
        },
      );
      switchAccount('42', null);
      let missLocally!: (rows: null) => void;
      mockFindRows.mockReturnValueOnce(
        new Promise(resolve => {
          missLocally = resolve;
        }),
      );
      const stale = loadNotes(verse);
      await Promise.resolve();

      switchAccount('43', 'token-b');
      missLocally(null);
      await expect(stale).rejects.toThrow(/not the active session/);
      expect(bearers).toEqual([]);
    });
  });
});

describe('bounded note requests and partial results (#901)', () => {
  type Pending = {
    chapter: number;
    verse: number;
    answer: () => void;
    fail: () => void;
  };
  let pending: Pending[];
  let active: number;
  let peak: number;
  let starts: number;

  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  const ref = (chapterNumber: number, verseNumber: number) => ({
    chapterNumber,
    verseNumber,
  });
  const chapterRefs = (chapter: number, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ref(chapter, from + i));
  const itemFor = (
    chapter: number,
    verse: number,
    id = chapter * 1000 + verse,
  ) => ({
    ...sampleItem,
    id,
    name: `Mark ${chapter}:${verse}`,
    localizedName: `Mark ${chapter}:${verse}`,
  });
  const unit = (
    verseRefs: { chapterNumber: number; verseNumber: number }[],
  ) => ({
    projectId: 7,
    bookCode: 'MRK',
    chapterNumber: verseRefs[0]!.chapterNumber,
    verseNumber: verseRefs[0]!.verseNumber,
    verseRefs,
  });

  /** Answers (or fails) every request as it starts, newest first. */
  async function settleAll(
    load: Promise<unknown>,
    fails: (chapter: number, verse: number) => boolean = () => false,
  ) {
    let done = false;
    void load.then(
      () => (done = true),
      () => (done = true),
    );
    while (!done) {
      await flush();
      const batch = pending.splice(0).reverse();
      for (const call of batch) {
        if (fails(call.chapter, call.verse)) call.fail();
        else call.answer();
      }
    }
  }

  beforeEach(() => {
    clearPassageResourceReuse();
    switchAccount('', null);
    mockFindRows.mockResolvedValue(null);
    pending = [];
    active = 0;
    peak = 0;
    starts = 0;
    getTranslationNotes.mockImplementation(
      (_project, _book, chapter, verse) =>
        new Promise((resolve, reject) => {
          starts += 1;
          active += 1;
          peak = Math.max(peak, active);
          pending.push({
            chapter,
            verse,
            answer: () => {
              active -= 1;
              resolve({ items: [itemFor(chapter, verse)] });
            },
            fail: () => {
              active -= 1;
              reject(new ApiError(502, 'unavailable'));
            },
          });
        }),
    );
  });

  afterEach(() => {
    getTranslationNotes.mockReset();
    mockFindRows.mockReset();
    mockReadJson.mockReset();
  });

  it.each([
    ['an uncached 176-verse chapter', chapterRefs(1, 1, 176)],
    [
      'a 201-verse unit across a chapter break',
      [...chapterRefs(1, 1, 150), ...chapterRefs(2, 1, 51)],
    ],
  ])('keeps %s to the cap and anchors every note', async (_label, refs) => {
    const load = loadTranslationNotesForUnit(unit(refs));
    await settleAll(load);
    const result = await load;

    expect(starts).toBe(refs.length);
    expect(peak).toBe(TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT);
    expect(result.failedRefs).toEqual([]);
    expect(result.succeededRefs).toEqual(refs);
    expect(result.notes.map(note => note.verse)).toEqual(refs);
    expect(result.notes.map(note => note.title)).toEqual(
      refs.map(r => `Mark ${r.chapterNumber}:${r.verseNumber}`),
    );
  });

  it('keeps the readable verses and lists exactly the failed ones', async () => {
    const refs = chapterRefs(14, 1, 12);
    const load = loadTranslationNotesForUnit(unit(refs));
    await settleAll(load, (_c, verse) => verse % 5 === 0);
    const result = await load;

    expect(result.failedRefs).toEqual([ref(14, 5), ref(14, 10)]);
    expect(result.succeededRefs).toHaveLength(10);
    expect(result.notes.map(note => note.verse?.verseNumber)).toEqual([
      1, 2, 3, 4, 6, 7, 8, 9, 11, 12,
    ]);
  });

  it('lists every verse when all of them fail', async () => {
    const refs = chapterRefs(14, 1, 6);
    const load = loadTranslationNotesForUnit(unit(refs));
    await settleAll(load, () => true);

    await expect(load).resolves.toMatchObject({
      notes: [],
      succeededRefs: [],
      failedRefs: refs,
    });
  });

  it('counts an empty answer as a finished lookup', async () => {
    getTranslationNotes.mockResolvedValue({ items: [] });

    const result = await loadTranslationNotesForUnit(
      unit(chapterRefs(14, 1, 3)),
    );

    expect(result.succeededRefs).toEqual(chapterRefs(14, 1, 3));
    expect(result.failedRefs).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it('orders local and remote notes by verse and anchors a shared note on its first verse', async () => {
    mockFindRows.mockImplementation(async query =>
      query.verseNumber === 4
        ? [downloadedRow({ resourceId: 'local-4', label: 'Mark 14:4' })]
        : null,
    );
    mockReadJson.mockResolvedValue(sampleItem.content);
    let answerVerse7!: () => void;
    let verse9Answered!: () => void;
    const verse9 = new Promise<void>(resolve => {
      verse9Answered = resolve;
    });
    getTranslationNotes.mockImplementation(
      (_p, _b, chapter, verse) =>
        new Promise(answer => {
          // Verses 7 and 9 share one note; 7 answers only after 9.
          const reply = () =>
            answer({
              items: [
                itemFor(
                  chapter,
                  verse,
                  verse === 7 || verse === 9 ? 79 : verse,
                ),
              ],
            });
          if (verse === 7) {
            answerVerse7 = reply;
            return;
          }
          reply();
          if (verse === 9) verse9Answered();
        }),
    );
    const refs = [ref(14, 9), ref(14, 2), ref(14, 7), ref(14, 4)];

    const load = loadTranslationNotesForUnit(unit(refs));
    await verse9;
    await flush();
    answerVerse7();
    const result = await load;

    expect(getTranslationNotes).toHaveBeenCalledTimes(3);
    expect(
      result.notes.map(note => [note.id, note.verse?.verseNumber]),
    ).toEqual([
      ['tn-api-2-0', 2],
      ['tn-api-local-4-0', 4],
      ['tn-api-79-0', 7],
    ]);
    expect(result.succeededRefs).toEqual([
      ref(14, 2),
      ref(14, 4),
      ref(14, 7),
      ref(14, 9),
    ]);
  });

  it('makes no requests offline and lists missing verses as unavailable, not failed', async () => {
    mockFindRows.mockImplementation(async query =>
      query.verseNumber === 1
        ? [downloadedRow({ resourceId: 'local-1', label: 'Mark 14:1' })]
        : null,
    );
    mockReadJson.mockResolvedValue(sampleItem.content);

    const result = await loadTranslationNotesForUnit({
      ...unit(chapterRefs(14, 1, 3)),
      isOnline: false,
    });

    expect(getTranslationNotes).not.toHaveBeenCalled();
    expect(result.succeededRefs).toEqual([ref(14, 1)]);
    expect(result.unavailableOfflineRefs).toEqual([ref(14, 2), ref(14, 3)]);
    expect(result.failedRefs).toEqual([]);
  });

  it('retries only the failed verses and keeps what already loaded', async () => {
    const refs = chapterRefs(14, 1, 4);
    const first = loadTranslationNotesForUnit(unit(refs));
    await settleAll(first, (_c, verse) => verse === 2 || verse === 3);
    const previous = await first;
    starts = 0;

    const again = loadTranslationNotesForUnit({
      ...unit(previous.failedRefs),
      refresh: true,
    });
    await settleAll(again, (_c, verse) => verse === 3);
    const merged = mergeTranslationNotesRetry(previous, await again);

    expect(starts).toBe(2);
    expect(merged.failedRefs).toEqual([ref(14, 3)]);
    expect(merged.succeededRefs).toEqual([ref(14, 1), ref(14, 2), ref(14, 4)]);
    expect(merged.notes.map(note => note.verse?.verseNumber)).toEqual([
      1, 2, 4,
    ]);
  });

  it('stops looking through downloads once cancelled', async () => {
    let releaseLookup!: (rows: null) => void;
    mockFindRows.mockReturnValueOnce(
      new Promise(resolve => {
        releaseLookup = resolve;
      }),
    );
    const controller = new AbortController();
    const load = loadTranslationNotesForUnit({
      ...unit(chapterRefs(14, 1, 5)),
      signal: controller.signal,
    });
    await flush();

    controller.abort();
    releaseLookup(null);

    await expect(load).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFindRows).toHaveBeenCalledTimes(1);
    expect(getTranslationNotes).not.toHaveBeenCalled();
  });

  it('stops a cancelled load from starting more and shares the cap with the next one', async () => {
    const controller = new AbortController();
    const old = loadTranslationNotesForUnit({
      ...unit(chapterRefs(1, 1, 40)),
      signal: controller.signal,
    });
    await flush();
    expect(starts).toBe(TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT);

    controller.abort();
    const next = loadTranslationNotesForUnit(unit(chapterRefs(2, 1, 10)));
    await flush();
    // The old requests still hold every slot until they settle.
    expect(starts).toBe(TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT);

    await settleAll(Promise.allSettled([old, next]));
    await expect(old).rejects.toMatchObject({ name: 'AbortError' });
    const result = await next;

    expect(peak).toBe(TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT);
    expect(starts).toBe(TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT + 10);
    expect(result.succeededRefs).toEqual(chapterRefs(2, 1, 10));
  });
});
