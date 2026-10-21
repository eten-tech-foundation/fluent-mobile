SELECT ca.id AS assignment_id, 
  COUNT(DISTINCT CASE WHEN r.id IS NOT NULL AND r.is_selected = 1 THEN r.id END) AS recording_count,
  COUNT(DISTINCT CASE
    WHEN r.id IS NOT NULL AND r.is_selected = 1
      AND r.sync_status NOT IN ('uploaded', 'conflicted') THEN r.id
  END) AS pending_count,
  MAX(CASE WHEN r.is_selected = 1 THEN r.updated_at END) AS last_recording_activity
FROM chapter_assignments ca

  LEFT JOIN bible_texts bt_r
    ON bt_r.bible_id = ca.bible_id
    AND bt_r.book_id = ca.book_id
    AND bt_r.chapter_number = ca.chapter_number
  LEFT JOIN recordings r ON r.bible_text_id = bt_r.id
    AND r.is_selected = 1
    AND (r.project_unit_id IS NULL OR r.project_unit_id = ca.project_unit_id)
    AND r.recorded_by_user_id = 10
WHERE ca.id=1183 GROUP BY ca.id;
