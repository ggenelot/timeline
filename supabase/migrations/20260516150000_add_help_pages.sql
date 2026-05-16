CREATE TABLE help_pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE help_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Help pages readable by authenticated users"
  ON help_pages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Help pages managed by admins"
  ON help_pages FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
