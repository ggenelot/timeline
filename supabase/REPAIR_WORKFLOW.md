# Supabase migration history realignment (remote ↔ local)

Use this workflow when the production deploy (`.github/workflows/supabase-prod.yml`,
which runs `supabase db push` after CI succeeds on `main`) fails with:

```
Remote migration versions not found in local migrations directory.
... supabase migration repair --status reverted <versions...>
```

This means the remote migration-history table
(`supabase_migrations.schema_migrations`) has drifted from the files in
`supabase/migrations/`. While drifted, `supabase db push` refuses to apply
**anything**, so no merged migration reaches the database until the history is
realigned.

## Why this happens (root cause)

The drift is almost always caused by **renaming or re-timestamping a migration
file after it has already been applied to production**. The database records the
*old* version; the repo now only has the *new* version. The result is a two-way
mismatch:

- versions in the remote history with no local file (orphans), and
- local files with no remote history row (look "pending" but are already applied).

The schema itself is usually already correct — only the bookkeeping is wrong.

## Prevention (read this first)

- **Never rename, re-timestamp, or delete a migration file once it has merged to
  `main`.** If a migration was wrong, add a *new* migration that fixes it.
- Keep one unique, monotonically increasing `YYYYMMDDHHMMSS` prefix per file
  (enforced by `.github/workflows/supabase-migration-timestamp-guard.yml`).
- Apply schema changes through committed migration files, not ad-hoc SQL, so the
  history table stays in sync with the repo.

## Fixing the drift

The goal is to make `schema_migrations` contain **exactly** the set of versions
present as files in `supabase/migrations/`, without re-running DDL (the schema is
already applied).

### Preferred: Supabase CLI (`migration repair`)

```bash
supabase migration list   # shows local vs remote, Local/Remote columns

# For each version that is APPLIED in the DB and has a matching local file:
supabase migration repair --status applied <version>

# For each orphan version in the remote history with no local file:
supabase migration repair --status reverted <version>

supabase migration list   # re-check: every row should line up
```

### Last resort: direct reconciliation (no local CLI/DB password)

`migration repair` is just `INSERT`/`DELETE` on `schema_migrations`. If you only
have SQL access (e.g. via the Supabase MCP), back up first, then align the table:

```sql
-- 1. Back up
create table supabase_migrations.schema_migrations_backup_<date> as
  select * from supabase_migrations.schema_migrations;

-- 2. Delete orphan rows (remote versions with no local file)
delete from supabase_migrations.schema_migrations where version in (...);

-- 3. Insert rows for local files missing from the history (schema already applied)
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('<version>', '<name>', array['-- history reconciled']::text[])
on conflict (version) do nothing;
```

After reconciling, the version set in `schema_migrations` must equal the set of
file prefixes in `supabase/migrations/`. Then `supabase db push` is a no-op and
future merges deploy normally.

## Notes

- Prefer `migration repair` over hand-editing `schema_migrations` whenever the
  CLI and DB credentials are available.
- Some orphan history rows (e.g. a fix/revert pair, or a refactor that was later
  squashed) legitimately have no local file. Deleting their history rows is
  correct — their net effect already lives in the current schema via later
  migrations. Do **not** recreate files for them; that risks double-applying.
- Before creating new migration files, verify all file timestamps in
  `supabase/migrations` are unique.
