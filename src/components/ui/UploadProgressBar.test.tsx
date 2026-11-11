import { render, screen } from '@testing-library/react-native';
import {
  formatCurrentChapterTakes,
  UploadProgressBar,
} from './UploadProgressBar';

describe('UploadProgressBar (#886)', () => {
  it('keeps chapter counts as the headline and hides the take line without a current chapter', () => {
    render(<UploadProgressBar uploadedChapters={1} totalChapters={4} />);

    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('1 of 4 chapters uploaded')).toBeTruthy();
    expect(screen.queryByTestId('upload-progress-current-chapter')).toBeNull();
  });

  it('credits the in-flight chapter fractionally so a long chapter moves the bar', () => {
    render(
      <UploadProgressBar
        uploadedChapters={1}
        totalChapters={4}
        currentChapter={{
          bookId: 1,
          chapterNumber: 2,
          completedTakes: 5,
          failedTakes: 0,
          totalTakes: 10,
        }}
      />,
    );

    // (1 + 5/10) / 4 = 37.5% → 38%
    expect(screen.getByText('38%')).toBeTruthy();
    expect(screen.getByText('1 of 4 chapters uploaded')).toBeTruthy();
    expect(
      screen.getByTestId('upload-progress-current-chapter'),
    ).toHaveTextContent('Chapter 2: 5 of 10 takes uploaded');
  });

  it('does not count failed takes as progress and shows them on the take line', () => {
    render(
      <UploadProgressBar
        uploadedChapters={3}
        totalChapters={4}
        currentChapter={{
          bookId: 1,
          chapterNumber: 4,
          completedTakes: 7,
          failedTakes: 3,
          totalTakes: 10,
        }}
      />,
    );

    // (3 + 7/10) / 4 = 92.5% → 93%, not 100%: the chapter is still pending.
    expect(screen.getByText('93%')).toBeTruthy();
    expect(
      screen.getByTestId('upload-progress-current-chapter'),
    ).toHaveTextContent('Chapter 4: 7 of 10 takes uploaded · 3 failed');
  });

  it('never exceeds 100% when the counts disagree transiently', () => {
    render(
      <UploadProgressBar
        uploadedChapters={4}
        totalChapters={4}
        currentChapter={{
          bookId: 1,
          chapterNumber: 4,
          completedTakes: 7,
          failedTakes: 0,
          totalTakes: 10,
        }}
      />,
    );

    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('formats the take line', () => {
    expect(
      formatCurrentChapterTakes({
        bookId: 1,
        chapterNumber: 3,
        completedTakes: 2,
        failedTakes: 0,
        totalTakes: 10,
      }),
    ).toBe('Chapter 3: 2 of 10 takes uploaded');
    expect(
      formatCurrentChapterTakes({
        bookId: 1,
        chapterNumber: 3,
        completedTakes: 2,
        failedTakes: 1,
        totalTakes: 10,
      }),
    ).toBe('Chapter 3: 2 of 10 takes uploaded · 1 failed');
  });
});
