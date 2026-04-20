# AGENTS Instructions

## Supabase migrations safety rules
- Always inspect the existing files in `supabase/migrations` before creating a new migration.
- Never reuse an existing timestamp prefix for a new migration file.
- Never edit production/remote schema manually without reconciling the repository immediately after (using the official Supabase migration repair + pull workflow).
- Never propose or apply workarounds that directly edit `supabase_migrations.schema_migrations` rows by hand.
- Before finishing any task that changes the database schema, verify there is no timestamp collision in `supabase/migrations`.
