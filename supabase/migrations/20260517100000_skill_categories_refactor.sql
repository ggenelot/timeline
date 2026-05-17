-- 1. Create skill_categories table
CREATE TABLE skill_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT 'slate',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE skill_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_skill_categories"
  ON skill_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_manage_skill_categories"
  ON skill_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 3. Update skills table: remove old columns, add new ones
ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_category_check;
ALTER TABLE skills DROP COLUMN IF EXISTS category;
ALTER TABLE skills DROP COLUMN IF EXISTS level;
ALTER TABLE skills DROP COLUMN IF EXISTS label;
ALTER TABLE skills ADD COLUMN category_id uuid REFERENCES skill_categories(id) ON DELETE SET NULL;
ALTER TABLE skills ADD COLUMN display_order integer NOT NULL DEFAULT 0;

-- 4. Clear legacy Google Sheets sync data
DELETE FROM profile_skills;
DELETE FROM mission_type_required_skills;
DELETE FROM mission_required_skills;
DELETE FROM skills;
