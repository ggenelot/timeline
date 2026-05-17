ALTER TABLE skills
  DROP CONSTRAINT IF EXISTS skills_category_id_fkey,
  ADD CONSTRAINT skills_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE CASCADE;
