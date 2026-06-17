export const createTableQueries: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT,
      last_name TEXT
    );`,

  `CREATE TABLE IF NOT EXISTS languages (
      id                  INTEGER PRIMARY KEY,
      lang_name           TEXT NOT NULL,
      lang_name_localized TEXT,
      lang_code_iso_639_3 TEXT,
      script_direction    TEXT NOT NULL DEFAULT 'ltr'
    );`,

  `CREATE TABLE IF NOT EXISTS books (
      id               INTEGER PRIMARY KEY,
      code             TEXT NOT NULL,
      eng_display_name TEXT NOT NULL
    );`,

  `CREATE TABLE IF NOT EXISTS bibles (
      id           INTEGER PRIMARY KEY,
      language_id  INTEGER NOT NULL REFERENCES languages(id),
      name         TEXT NOT NULL,
      abbreviation TEXT NOT NULL
    );`,

  `CREATE TABLE IF NOT EXISTS projects (
      id                 INTEGER PRIMARY KEY,
      name               TEXT NOT NULL,
      source_language_id INTEGER NOT NULL REFERENCES languages(id),
      target_language_id INTEGER NOT NULL REFERENCES languages(id),
      is_active          INTEGER NOT NULL DEFAULT 1,
      status             TEXT NOT NULL DEFAULT 'not_assigned',
      updated_at         TEXT NOT NULL
    );`,

  `CREATE TABLE IF NOT EXISTS project_units (
      id         INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status     TEXT NOT NULL DEFAULT 'not_started',
      updated_at TEXT 
    );`,

  `CREATE INDEX IF NOT EXISTS idx_pu_project ON project_units(project_id);`,

  ` CREATE TABLE IF NOT EXISTS chapter_assignments (
      id               INTEGER PRIMARY KEY,
      project_unit_id INTEGER NOT NULL REFERENCES project_units(id) ON DELETE CASCADE,
      bible_id         INTEGER NOT NULL REFERENCES bibles(id),
      book_id          INTEGER NOT NULL REFERENCES books(id),
      chapter_number   INTEGER NOT NULL,
      assigned_user_id  INTEGER ,
      peer_checker_id    INTEGER,
      status           TEXT NOT NULL,
      submitted_time   TEXT,
      updated_at       TEXT NOT NULL,
      UNIQUE (project_unit_id, bible_id, book_id, chapter_number)
    );`,

  `CREATE INDEX IF NOT EXISTS idx_ca_project_unit ON chapter_assignments(project_unit_id);`,

  `CREATE TABLE IF NOT EXISTS bible_texts (
      id             INTEGER PRIMARY KEY,
      bible_id       INTEGER NOT NULL REFERENCES bibles(id),
      book_id        INTEGER NOT NULL REFERENCES books(id),
      chapter_number INTEGER NOT NULL,
      verse_number   INTEGER NOT NULL,
      text           TEXT NOT NULL,
      UNIQUE (bible_id, book_id, chapter_number, verse_number)
    )`,

  `CREATE INDEX IF NOT EXISTS idx_bt_chapter ON bible_texts(bible_id, book_id, chapter_number);`,

  `CREATE TABLE IF NOT EXISTS recordings (
    id               INTEGER PRIMARY KEY,
    bible_text_id    INTEGER NOT NULL,
    project_unit_id  INTEGER NOT NULL,
    relative_path    TEXT NOT NULL,
    sync_status      TEXT NOT NULL DEFAULT 'pending',
    upload_error     TEXT,
    file_size        INTEGER,
    last_updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_unit_id, bible_text_id)
)`,

  `CREATE INDEX IF NOT EXISTS idx_recordings_sync ON recordings(sync_status)
 WHERE sync_status != 'synced'`,

  `CREATE TABLE IF NOT EXISTS user_projects (
  user_id    INTEGER NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);`,

  `CREATE INDEX IF NOT EXISTS idx_up_user ON user_projects(user_id);`,
];
