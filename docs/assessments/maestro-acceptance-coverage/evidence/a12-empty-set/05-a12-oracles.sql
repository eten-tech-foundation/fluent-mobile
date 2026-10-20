-- Read-only selected metadata only. Freeze results before runtime navigation.
-- My Work eligibility is stage-specific; peer assignment alone is insufficient.
SELECT ca.id, ca.book_id, b.eng_display_name AS book_name,
       ca.chapter_number, ca.status, ca.assigned_user_id, ca.peer_checker_id,
       pu.id AS milestone_id, p.id AS project_id, p.name AS project_name
FROM chapter_assignments ca
JOIN books b ON b.id=ca.book_id
JOIN project_units pu ON pu.id=ca.project_unit_id
JOIN projects p ON p.id=pu.project_id
WHERE (ca.status IN ('not_started','draft') AND ca.assigned_user_id=12)
   OR (ca.status='peer_check' AND ca.peer_checker_id=12)
ORDER BY b.id,ca.chapter_number;

-- Projects tab renders milestone rows; this is not a project-card set.
SELECT DISTINCT pu.id AS milestone_id, pu.project_id,
       COALESCE(NULLIF(pu.name,''),p.name,'Milestone '||pu.id) AS milestone_name,
       p.name AS project_name
FROM user_projects up
JOIN projects p ON p.id=up.project_id
JOIN project_units pu ON pu.project_id=p.id
WHERE up.user_id=12
ORDER BY p.name COLLATE NOCASE,milestone_name COLLATE NOCASE;

-- Excluded controls only; no account/grant/role inference.
SELECT pu.id AS excluded_milestone_id,pu.project_id
FROM project_units pu
WHERE NOT EXISTS (
  SELECT 1 FROM user_projects up WHERE up.project_id=pu.project_id AND up.user_id=12
)
ORDER BY pu.id;
