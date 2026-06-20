# Timeline — Business Context (Agent-Readable)

> **Purpose of this document**: Provides complete business context for AI agents working on this codebase. Read this before making any feature, data model, or workflow decision.

---

## 1. What This Application Does

**Timeline** is a mission coordination platform for civil protection volunteers in France (protection civile). It manages the full lifecycle of volunteer missions: creation, staffing, team selection, and operational tracking — replacing manual coordination (phone calls, emails, spreadsheets) with a centralized, role-gated web application.

**Core value proposition**: A responsable (manager) creates a mission, volunteers respond with their availability, the responsable selects the team, and the system tracks everything — including a Slack integration that automatically creates private channels for confirmed teams.

---

## 2. Business Domain & Key Entities

### Users & Roles

| Role | French Name | Description |
|---|---|---|
| `admin` | Administrateur | Full access: manages all missions, volunteers, configuration, system-wide reports |
| `responsable` | Responsable | Creates and manages their own missions, selects volunteer teams |
| `bénévole` | Bénévole | Volunteer: responds to proposed missions, views their assignments |

Roles are stored in `profiles.role`. Row-Level Security (RLS) in Supabase enforces data visibility at the database layer — bénévoles cannot see missions that aren't proposed, responsables cannot see other responsables' missions, etc.

### Mission (core entity)

A **mission** is a staffed activity requiring one or more volunteers. Key attributes:

- `title`, `description`, `location`
- `starts_at`, `ends_at` — time window
- `required_volunteers` — headcount target
- `mission_type_id` — category (Maraude, Garde, Formation, Vie d'antenne, Poste de secours)
- `status` — lifecycle stage (see below)
- `created_by` — responsable who owns it
- `slack_channel_id` — linked Slack private channel (optional)

**Mission status lifecycle:**
```
draft → proposed → confirmed
                 → closed
                 → cancelled
```
- `draft`: Only visible to the creating responsable and admins
- `proposed`: Visible to bénévoles; they can respond
- `confirmed`: Team is locked; volunteers are notified via Slack
- `closed`: Mission executed/completed
- `cancelled`: Mission cancelled before execution

### Mission Proposal (volunteer response)

A **mission_proposal** links a volunteer to a mission and captures two independent states:

1. **Volunteer response** (`response`): `no_response | available | unavailable`
2. **Responsable decision** (`status`): `pending | accepted | refused`

These are intentionally separate: a volunteer marks themselves as available, then the responsable accepts or refuses them for the final team.

### Mission Assignment (final team)

A **mission_assignment** represents a confirmed team slot:
- Links `volunteer_id` to `mission_id`
- Can be tied to a specific required skill (`mission_required_skill_id`)
- `assignment_status`: `selected | confirmed | declined | replaced`

### Skills

- **skills**: Reference catalog (name, category, color)
- **profile_skills**: Which skills each volunteer has
- **mission_required_skills**: Which skills (and how many of each) a mission needs

Skills drive visibility rules: a volunteer may only see missions that require at least one of their skills (depending on role behavior configuration).

### Mission Types

Pre-configured mission categories with default settings:
- Default required volunteer count
- Default required skills

Built-in types: `Maraude`, `Garde`, `Formation`, `Vie d'antenne`, `Poste de secours`

### Activity Logs (immutable audit trail)

Every key action writes an immutable row to `activity_logs` via SQL triggers:
- `mission_created`, `mission_status_changed`
- `proposal_response_updated`
- `volunteer_selected`, `volunteer_removed`

These cannot be edited through the application. They power the per-mission "History" tab.

### Roles & Role Behaviors

Beyond auth roles, the system has configurable **functional roles** (`roles` table) with **role_behaviors** that define per-mission-type rules:
- `can_create` — can create this mission type
- `can_manage` — can manage assignments
- `required_for_visibility` — mission visibility requires matching skill
- `auto_slack` — automatically add to Slack channel

---

## 3. Key Workflows

### Responsable: Create and Staff a Mission
1. Go to `/missions/new` → choose mission type → pre-fills skills/headcount
2. Set dates, location, description → save as `draft`
3. Publish draft → status becomes `proposed` → bénévoles can now see and respond
4. Review responses at `/missions/[id]` → available volunteers listed with their skills
5. Click to select volunteers → creates `mission_assignment` rows
6. Confirm mission → triggers Slack channel creation + volunteer DMs

### Bénévole: Respond to a Mission
1. See proposed missions on `/missions` (timeline / chronological view)
2. Open mission detail → respond: available / unavailable
3. Wait for responsable decision (pending → accepted / refused)
4. If accepted, mission appears in `/my-missions` (confirmed assignments)

### Admin: Manage System
1. `/admin/volunteers` — view/filter all volunteers
2. `/admin/proposals` — bulk validate or refuse pending proposals
3. `/admin/missions/import` — batch import from Google Sheets
4. `/admin/skills`, `/admin/mission-types`, `/admin/roles` — configure reference data
5. `/admin/stats` — aggregate metrics
6. `/admin/slack` — Slack bot health and configuration

---

## 4. Business Rules & Constraints

- **State guards**: Volunteers cannot change their response on `confirmed` or `closed` missions.
- **Proposal separation**: Volunteer response ≠ team selection. A volunteer can say "available" but the responsable can still refuse them.
- **Skill quantities**: A mission can require "2 × Sauveteur Aquatique" — quantity is tracked per required skill.
- **Import deduplication**: Google Sheets import deduplicates by `title + starts_at + ends_at`.
- **Immutable history**: Activity logs are written by SQL triggers, not by application code. They cannot be overwritten.
- **RLS is authoritative**: Data access rules are enforced at database level. Application-level checks are secondary.
- **Slack is optional**: The app works fully without Slack. Bot features are additive.

---

## 5. Tech Stack (brief)

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Next.js server actions + API routes |
| Database | Supabase (PostgreSQL), RLS, SQL triggers |
| Auth | Supabase Auth (email/password + Slack OAuth) |
| Notifications | Slack Bot API |
| Deployment | Vercel (frontend) + Supabase Cloud (DB) |
| CI/CD | GitHub Actions (auto-migrate on `main` push) |

---

## 6. File System Map (critical paths)

```
/app
  /missions           → volunteer timeline view + mission detail
  /missions/new       → mission creation form
  /my-missions        → bénévole's confirmed assignments
  /admin
    /gestion          → admin hub (redirects to sub-sections)
    /proposals        → bulk proposal management
    /missions/import  → Google Sheets batch import
    /volunteers       → volunteer directory
    /skills           → skill catalog management
    /mission-types    → mission type defaults
    /roles            → role behavior configuration
    /stats            → aggregate metrics dashboard
    /slack            → Slack bot health

/lib
  /types.ts           → all TypeScript entity types (canonical source of truth)
  /slack/             → Slack bot & OAuth utilities

/supabase/migrations/ → 60+ SQL migration files (database schema history)

/prisma/             → (not used; Supabase migrations are the schema source)
```

---

## 7. Seed / Test Data

The database seeds contain:
- 1 admin account
- 1 responsable account
- 3 bénévole accounts
- Pre-created missions in various statuses
- Team assignments with varied proposal/response states
- All 5 default mission types
- Sample skills and profile-skill mappings

Credentials and seed scripts are in `/supabase/seed.sql`.

---

## 8. What This App Is NOT

- Not a general-purpose event management tool
- Not a payroll or HR system (no compensation tracking)
- No email or SMS notifications (Slack only)
- No calendar sync or conflict detection
- No mobile app (responsive web only)
- Not multi-tenant (single civil protection organization per deployment)

---

## 9. Glossary

| Term | Definition |
|---|---|
| Bénévole | Volunteer; base-level user role |
| Responsable | Mission manager; creates and staffs missions |
| Maraude | Street patrol mission type |
| Garde | Guard/watch duty mission type |
| Poste de secours | First-aid post mission type |
| Proposal | A volunteer's response to a mission (available/unavailable) |
| Assignment | Final confirmed team slot for a volunteer on a mission |
| RLS | Row-Level Security (Supabase/PostgreSQL feature enforcing data access) |
| Frise chronologique | Timeline/chronological view (the main mission display for bénévoles) |