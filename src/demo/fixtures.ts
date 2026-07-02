import * as DBTypes from '../types/db/types';

/** Reserved ID range for sandbox demo data (90000+). */
export const DEMO_SEED_VERSION = 1;

export const DEMO_USER_ID = 90001;

const now = '2026-01-15T12:00:00.000Z';

export const demoUser: DBTypes.User = {
  id: DEMO_USER_ID,
  username: 'demo.translator',
  email: 'demo@fluent.bible',
  firstName: 'Demo',
  lastName: 'Translator',
};

export const demoLanguages: DBTypes.Language[] = [
  {
    id: 90001,
    langName: 'English',
    langNameLocalized: 'English',
    langCode: 'eng',
    scriptDirection: 'ltr',
  },
  {
    id: 90002,
    langName: 'Kiswahili',
    langNameLocalized: 'Kiswahili',
    langCode: 'swh',
    scriptDirection: 'ltr',
  },
];

export const demoBooks: DBTypes.Book[] = [
  { id: 90001, code: 'GEN', eng_display_name: 'Genesis' },
  { id: 90040, code: 'MAT', eng_display_name: 'Matthew' },
  { id: 90043, code: 'JHN', eng_display_name: 'John' },
];

export const demoBibles: DBTypes.Bible[] = [
  {
    id: 90001,
    languageId: 90001,
    name: 'English Standard Version',
    abbreviation: 'ESV',
  },
  {
    id: 90002,
    languageId: 90002,
    name: 'Kiswahili Demo Bible',
    abbreviation: 'SWA',
  },
];

export const demoProjects: DBTypes.Project[] = [
  {
    id: 90001,
    name: 'Demo Translation — Kiswahili',
    sourceLanguageId: 90001,
    targetLanguageId: 90002,
    target_language_name: 'Kiswahili',
    isActive: true,
    status: 'in_progress',
    updatedAt: now,
  },
  {
    id: 90002,
    name: 'Stakeholder Sample — Community Check',
    sourceLanguageId: 90001,
    targetLanguageId: 90002,
    target_language_name: 'Kiswahili',
    isActive: true,
    status: 'in_progress',
    updatedAt: now,
  },
];

export const demoChapterAssignments: DBTypes.ChapterAssignment[] = [
  {
    chapterAssignmentId: 90001,
    projectUnitId: 90001,
    projectId: 90001,
    bibleId: 90002,
    bookId: 90001,
    chapterNumber: 1,
    assignedUserId: DEMO_USER_ID,
    chapterStatus: 'draft',
    updatedAt: now,
    totalVerses: 5,
    completedVerses: 2,
  },
  {
    chapterAssignmentId: 90002,
    projectUnitId: 90001,
    projectId: 90001,
    bibleId: 90002,
    bookId: 90040,
    chapterNumber: 5,
    assignedUserId: 90002,
    peerCheckerId: DEMO_USER_ID,
    chapterStatus: 'peer_check',
    updatedAt: now,
    totalVerses: 4,
    completedVerses: 4,
  },
  {
    chapterAssignmentId: 90003,
    projectUnitId: 90002,
    projectId: 90002,
    bibleId: 90002,
    bookId: 90043,
    chapterNumber: 3,
    assignedUserId: DEMO_USER_ID,
    chapterStatus: 'not_started',
    updatedAt: now,
    totalVerses: 3,
    completedVerses: 0,
  },
];

export const demoBibleTexts: DBTypes.BibleText[] = [
  {
    bibleId: 90002,
    bookId: 90001,
    chapterNumber: 1,
    verses: [
      {
        bible_id: 90002,
        book_id: 90001,
        chapter_number: 1,
        verse_number: 1,
        text: 'Hapo mwanzo Mungu aliumba mbingu na dunia.',
      },
      {
        bible_id: 90002,
        book_id: 90001,
        chapter_number: 1,
        verse_number: 2,
        text: 'Wakati huu dunia ilikuwa haina umbo, na giza lilikuwa juu ya uso wa vilindi.',
      },
      {
        bible_id: 90002,
        book_id: 90001,
        chapter_number: 1,
        verse_number: 3,
        text: 'Mungu akasema, "Iwepo nuru," nayo nuru ikawepo.',
      },
      {
        bible_id: 90002,
        book_id: 90001,
        chapter_number: 1,
        verse_number: 4,
        text: 'Mungu akaona ya kuwa nuru ni njema, akatenganisha nuru na giza.',
      },
      {
        bible_id: 90002,
        book_id: 90001,
        chapter_number: 1,
        verse_number: 5,
        text: 'Mungu akaita nuru "mchana," na giza akaita "usiku." Ikawa jioni, ikawa asubuhi, siku ya kwanza.',
      },
    ],
  },
  {
    bibleId: 90002,
    bookId: 90040,
    chapterNumber: 5,
    verses: [
      {
        bible_id: 90002,
        book_id: 90040,
        chapter_number: 5,
        verse_number: 1,
        text: 'Alipoona makutano ya watu, akapanda mlimani.',
      },
      {
        bible_id: 90002,
        book_id: 90040,
        chapter_number: 5,
        verse_number: 2,
        text: 'Akafundisha akisema...',
      },
      {
        bible_id: 90002,
        book_id: 90040,
        chapter_number: 5,
        verse_number: 3,
        text: 'Heri walio maskini rohoni, maana ufalme wa mbinguni ni wao.',
      },
      {
        bible_id: 90002,
        book_id: 90040,
        chapter_number: 5,
        verse_number: 4,
        text: 'Heri walio na huzuni, maana watafarijiwa.',
      },
    ],
  },
  {
    bibleId: 90002,
    bookId: 90043,
    chapterNumber: 3,
    verses: [
      {
        bible_id: 90002,
        book_id: 90043,
        chapter_number: 3,
        verse_number: 1,
        text: 'Basi palikuwa na mtu wa Farisi, jina lake Nikodemo.',
      },
      {
        bible_id: 90002,
        book_id: 90043,
        chapter_number: 3,
        verse_number: 2,
        text: 'Huyu alikuja kwa Yesu usiku.',
      },
      {
        bible_id: 90002,
        book_id: 90043,
        chapter_number: 3,
        verse_number: 3,
        text: 'Yesu akamjibu, "Amin, amin, nakuambia..."',
      },
    ],
  },
];

export const demoProjectIds = demoProjects.map(project => project.id);
