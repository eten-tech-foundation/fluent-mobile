SELECT bt_r.id AS joined_bible_text_id,r.id AS matched_recording_id FROM chapter_assignments ca

  LEFT JOIN bible_texts bt_r
    ON bt_r.bible_id = ca.bible_id
    AND bt_r.book_id = ca.book_id
    AND bt_r.chapter_number = ca.chapter_number
  LEFT JOIN recordings r ON r.bible_text_id = bt_r.id
    AND r.is_selected = 1
    AND (r.project_unit_id IS NULL OR r.project_unit_id = ca.project_unit_id)
    AND r.recorded_by_user_id = 10
WHERE ca.id=1183 ORDER BY bt_r.verse_number,r.id;
