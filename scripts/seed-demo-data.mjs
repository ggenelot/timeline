#!/usr/bin/env node
// Populates the database with a large, varied set of demo data (volunteers,
// missions, skills, cursus...) so a fresh install shows the app's potential
// without hours of manual clicking. Additive: it never touches the 5 fixed
// `*@pcivile.test` accounts seeded by supabase/seed.sql.
//
// Usage:
//   npm run db:seed:demo
//   npm run db:seed:demo -- --force   # required if the target doesn't look local
//
// Safe to rerun: existing demo users/enrollments are reused, not duplicated.
// To start over completely, run `npm run supabase:db:reset` first.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));

function log(event, data = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check .env.local / .env.');
  process.exit(1);
}

const force = process.argv.includes('--force') || process.env.DEMO_SEED_FORCE === '1';
const looksLocal = /127\.0\.0\.1|localhost|host\.docker\.internal/.test(SUPABASE_URL);

if (!looksLocal && !force) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) does not look like a local Supabase instance.`);
  console.error('This script creates dozens of fake accounts and missions - rerun with --force (or DEMO_SEED_FORCE=1) only if you really want that in this project.');
  process.exit(1);
}
if (!looksLocal && force) {
  log('warning', { message: 'forcing demo seed against a non-local-looking Supabase URL', url: SUPABASE_URL });
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || 'DemoPass123!';
const VOLUNTEER_COUNT = Number(process.env.DEMO_SEED_VOLUNTEER_COUNT || 30);
const RESPONSABLE_COUNT = Number(process.env.DEMO_SEED_RESPONSABLE_COUNT || 4);
const ADMIN_COUNT = Number(process.env.DEMO_SEED_ADMIN_COUNT || 2);
const EMAIL_DOMAIN = 'timeline.demo';
const TITLE_PREFIX = '[DEMO] ';

const FIRST_NAMES = [
  'Alice', 'Baptiste', 'Camille', 'Damien', 'Elise', 'Fabien', 'Gabrielle', 'Hugo',
  'Ines', 'Julien', 'Karim', 'Laure', 'Mathieu', 'Nadia', 'Olivier', 'Pauline',
  'Quentin', 'Romane', 'Sami', 'Theo', 'Ursula', 'Victor', 'Wassila', 'Xavier',
  'Yasmine', 'Zoe', 'Adrien', 'Beatrice', 'Clement', 'Diane', 'Emile', 'Florence',
  'Gaspard', 'Helene', 'Idris', 'Juliette', 'Kevin', 'Lucie', 'Maxime', 'Nora'
];
const LAST_NAMES = [
  'Bernard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre',
  'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fontaine', 'Rousseau',
  'Vidal', 'Caron', 'Picard', 'Roger', 'Fournier', 'Girard', 'Bonnet', 'Dupont',
  'Lambert', 'Faure', 'Mercier', 'Blanc', 'Guerin', 'Boyer', 'Brun', 'Henry',
  'Robin', 'Gauthier', 'Dumont', 'Lopez', 'Fontaine', 'Chevalier', 'Robert', 'Renard'
];
const SECTORS = ['Nord', 'Sud', 'Est', 'Ouest', 'National'];
const CITIES = [
  'Lille', 'Roubaix', 'Dunkerque', 'Amiens', 'Lyon', 'Montpellier', 'Marseille',
  'Toulouse', 'Bordeaux', 'Nantes', 'Rennes', 'Strasbourg', 'Reims', 'Tours'
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomItem(list) {
  return list[randomInt(0, list.length - 1)];
}
function randomItems(list, count) {
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
function daysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function listExistingDemoUsers() {
  const byEmail = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email && user.email.endsWith(`@${EMAIL_DOMAIN}`)) {
        byEmail.set(user.email, user.id);
      }
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return byEmail;
}

async function ensureAuthUser(existing, email, fullName) {
  const existingId = existing.get(email);
  if (existingId) return existingId;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  return data.user.id;
}

async function main() {
  log('start', {
    target: SUPABASE_URL,
    volunteerCount: VOLUNTEER_COUNT,
    responsableCount: RESPONSABLE_COUNT,
    adminCount: ADMIN_COUNT
  });

  const existingUsers = await listExistingDemoUsers();
  log('existing_demo_users', { count: existingUsers.size });

  const plannedProfiles = [];
  for (let i = 1; i <= ADMIN_COUNT; i++) {
    plannedProfiles.push({ role: 'admin', emailPrefix: `demo-admin-${String(i).padStart(2, '0')}` });
  }
  for (let i = 1; i <= RESPONSABLE_COUNT; i++) {
    plannedProfiles.push({ role: 'responsable', emailPrefix: `demo-responsable-${String(i).padStart(2, '0')}` });
  }
  for (let i = 1; i <= VOLUNTEER_COUNT; i++) {
    plannedProfiles.push({ role: 'benevole', emailPrefix: `demo-volunteer-${String(i).padStart(2, '0')}` });
  }

  const profiles = [];
  for (const planned of plannedProfiles) {
    const email = `${planned.emailPrefix}@${EMAIL_DOMAIN}`;
    const fullName = `${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`;
    const id = await ensureAuthUser(existingUsers, email, fullName);
    profiles.push({ id, email, fullName, role: planned.role, sector: randomItem(SECTORS) });
  }
  log('auth_users_ready', { count: profiles.length });

  const { error: profileUpsertError } = await supabase
    .from('profiles')
    .upsert(
      profiles.map((p) => ({ id: p.id, full_name: p.fullName, email: p.email, role: p.role, sector: p.sector, identifier: p.email.split('@')[0] })),
      { onConflict: 'id' }
    );
  if (profileUpsertError) throw profileUpsertError;
  log('profiles_upserted', { count: profiles.length });

  const admins = profiles.filter((p) => p.role === 'admin');
  const responsables = profiles.filter((p) => p.role === 'responsable');
  const volunteers = profiles.filter((p) => p.role === 'benevole');
  const managers = [...admins, ...responsables];

  // --- Skills & skill domain progress ---
  const { data: skills, error: skillsError } = await supabase.from('skills').select('id, name');
  if (skillsError) throw skillsError;

  const profileSkillRows = [];
  for (const volunteer of volunteers) {
    for (const skill of randomItems(skills, randomInt(1, 3))) {
      profileSkillRows.push({ profile_id: volunteer.id, skill_id: skill.id });
    }
  }
  if (profileSkillRows.length) {
    const { error } = await supabase
      .from('profile_skills')
      .upsert(profileSkillRows, { onConflict: 'profile_id,skill_id' });
    if (error) throw error;
  }
  log('profile_skills_upserted', { count: profileSkillRows.length });

  const { data: domains, error: domainsError } = await supabase.from('skill_domains').select('id, code');
  if (domainsError) throw domainsError;
  const { data: levels, error: levelsError } = await supabase.from('skill_levels').select('id, domain_id, rank');
  if (levelsError) throw levelsError;

  const progressRows = [];
  for (const volunteer of volunteers) {
    for (const domain of randomItems(domains, randomInt(1, 2))) {
      const domainLevels = levels.filter((l) => l.domain_id === domain.id);
      if (!domainLevels.length) continue;
      const level = randomItem(domainLevels);
      progressRows.push({ profile_id: volunteer.id, domain_id: domain.id, level_id: level.id });
    }
  }
  if (progressRows.length) {
    const { error } = await supabase
      .from('profile_domain_progress')
      .upsert(progressRows, { onConflict: 'profile_id,domain_id' });
    if (error) throw error;
  }
  log('profile_domain_progress_upserted', { count: progressRows.length });

  // --- Missions ---
  const { data: missionTypes, error: missionTypesError } = await supabase.from('mission_types').select('id, name');
  if (missionTypesError) throw missionTypesError;

  const { data: existingDemoMissions, error: existingMissionsError } = await supabase
    .from('missions')
    .select('id, title, status, created_by')
    .like('title', `${TITLE_PREFIX}%`);
  if (existingMissionsError) throw existingMissionsError;
  const existingMissionTitles = new Set(existingDemoMissions.map((m) => m.title));

  const statuses = ['draft', 'proposed', 'closed', 'confirmed', 'cancelled'];
  const missionsToInsert = [];
  const MISSION_COUNT = 25;
  for (let i = 1; i <= MISSION_COUNT; i++) {
    const status = statuses[i % statuses.length];
    const title = `${TITLE_PREFIX}Mission démo ${String(i).padStart(2, '0')}`;
    if (existingMissionTitles.has(title)) continue;
    const isPast = i % 2 === 0;
    const startOffset = isPast ? randomInt(-60, -1) : randomInt(1, 60);
    missionsToInsert.push({
      title,
      description: 'Mission générée automatiquement pour la démonstration.',
      location: randomItem(CITIES),
      mission_type_id: randomItem(missionTypes).id,
      starts_at: daysFromNow(startOffset),
      ends_at: daysFromNow(startOffset + randomInt(0, 1) + 0.25),
      required_volunteers: randomInt(2, 8),
      status,
      created_by: randomItem(managers).id
    });
  }
  let insertedMissions = [];
  if (missionsToInsert.length) {
    const { data, error } = await supabase.from('missions').insert(missionsToInsert).select('id, title, status, created_by');
    if (error) throw error;
    insertedMissions = data;
  }
  const allDemoMissions = [...existingDemoMissions, ...insertedMissions];
  log('missions_created', { created: insertedMissions.length, total: allDemoMissions.length, skippedExisting: missionsToInsert.length === 0 ? 0 : MISSION_COUNT - missionsToInsert.length });

  // mission_required_skills for a subset of missions
  const requiredSkillRows = [];
  for (const mission of randomItems(allDemoMissions, Math.ceil(allDemoMissions.length / 2))) {
    for (const skill of randomItems(skills, randomInt(1, 2))) {
      requiredSkillRows.push({ mission_id: mission.id, skill_id: skill.id });
    }
  }
  if (requiredSkillRows.length) {
    const { error } = await supabase
      .from('mission_required_skills')
      .upsert(requiredSkillRows, { onConflict: 'mission_id,skill_id' });
    if (error) throw error;
  }
  log('mission_required_skills_upserted', { count: requiredSkillRows.length });

  // mission_proposals + mission_assignments
  const proposalResponses = ['available', 'unavailable', 'no_response'];
  const proposalStatuses = ['pending', 'accepted', 'refused'];
  const proposalRows = [];
  const assignmentRows = [];
  for (const mission of allDemoMissions.filter((m) => m.status !== 'draft')) {
    const targetVolunteers = randomItems(volunteers, randomInt(Math.ceil(volunteers.length * 0.4), Math.ceil(volunteers.length * 0.7)));
    for (const volunteer of targetVolunteers) {
      const response = randomItem(proposalResponses);
      proposalRows.push({
        mission_id: mission.id,
        volunteer_id: volunteer.id,
        proposed_by: mission.created_by,
        response,
        status: response === 'available' ? randomItem(proposalStatuses) : 'pending'
      });
    }
    if (['closed', 'confirmed'].includes(mission.status)) {
      const candidates = targetVolunteers.slice(0, randomInt(1, Math.min(4, targetVolunteers.length)));
      for (const volunteer of candidates) {
        assignmentRows.push({
          mission_id: mission.id,
          volunteer_id: volunteer.id,
          assignment_status: randomItem(['selected', 'confirmed', 'confirmed', 'declined'])
        });
      }
    }
  }
  if (proposalRows.length) {
    const { error } = await supabase
      .from('mission_proposals')
      .upsert(proposalRows, { onConflict: 'mission_id,volunteer_id' });
    if (error) throw error;
  }
  log('mission_proposals_upserted', { count: proposalRows.length });

  if (assignmentRows.length) {
    const { error } = await supabase
      .from('mission_assignments')
      .upsert(assignmentRows, { onConflict: 'mission_id,volunteer_id' });
    if (error) throw error;
  }
  log('mission_assignments_upserted', { count: assignmentRows.length });

  // --- Cursus enrollment, doublures, competence validations ---
  const { data: cursusList, error: cursusError } = await supabase.from('cursus').select('id, code');
  if (cursusError) throw cursusError;
  const { data: phases, error: phasesError } = await supabase.from('cursus_phases').select('id, cursus_id, kind');
  if (phasesError) throw phasesError;
  const { data: competences, error: competencesError } = await supabase.from('cursus_competences').select('id, phase_id');
  if (competencesError) throw competencesError;

  const enrolledVolunteers = randomItems(volunteers, Math.min(12, volunteers.length));
  const volunteerCursusRows = enrolledVolunteers.map((volunteer) => ({
    profile_id: volunteer.id,
    cursus_id: randomItem(cursusList).id
  }));
  const { data: existingVolunteerCursus, error: existingVolunteerCursusError } = await supabase
    .from('volunteer_cursus')
    .select('profile_id, cursus_id')
    .in('profile_id', enrolledVolunteers.map((v) => v.id));
  if (existingVolunteerCursusError) throw existingVolunteerCursusError;
  const existingVolunteerCursusKeys = new Set(
    existingVolunteerCursus.map((vc) => `${vc.profile_id}:${vc.cursus_id}`)
  );

  let volunteerCursus = [];
  if (volunteerCursusRows.length) {
    const { data, error } = await supabase
      .from('volunteer_cursus')
      .upsert(volunteerCursusRows, { onConflict: 'profile_id,cursus_id' })
      .select('id, profile_id, cursus_id');
    if (error) throw error;
    volunteerCursus = data;
  }
  log('volunteer_cursus_upserted', { count: volunteerCursus.length });

  // Doublures have no natural unique key, so only generate them for
  // newly-created enrollments to keep reruns from piling up duplicates.
  const newVolunteerCursus = volunteerCursus.filter(
    (vc) => !existingVolunteerCursusKeys.has(`${vc.profile_id}:${vc.cursus_id}`)
  );

  const doublureRows = [];
  for (const vc of newVolunteerCursus) {
    const cursusPhases = phases.filter((p) => p.cursus_id === vc.cursus_id);
    if (!cursusPhases.length) continue;
    for (const phase of randomItems(cursusPhases, randomInt(1, cursusPhases.length))) {
      const useMission = Math.random() > 0.5 && allDemoMissions.length > 0;
      doublureRows.push({
        volunteer_cursus_id: vc.id,
        phase_id: phase.id,
        mission_id: useMission ? randomItem(allDemoMissions).id : null,
        event_name: useMission ? null : `Exercice externe - ${randomItem(CITIES)}`,
        event_date: useMission ? null : daysFromNow(randomInt(-90, -1)).slice(0, 10),
        event_lieu: useMission ? null : randomItem(CITIES),
        is_external: !useMission,
        supervisor_name: `${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`,
        is_pending: Math.random() > 0.7,
        declared_by: randomItem(managers).id
      });
    }
  }
  let doublures = [];
  if (doublureRows.length) {
    const { data, error } = await supabase.from('doublures').insert(doublureRows).select('id, phase_id, volunteer_cursus_id');
    if (error) throw error;
    doublures = data;
  }
  log('doublures_created', { count: doublures.length });

  const validationRows = [];
  for (const doublure of doublures) {
    if (Math.random() > 0.6) continue; // leave some doublures without a validated competence yet
    const phaseCompetences = competences.filter((c) => c.phase_id === doublure.phase_id);
    if (!phaseCompetences.length) continue;
    const competence = randomItem(phaseCompetences);
    validationRows.push({
      volunteer_cursus_id: doublure.volunteer_cursus_id,
      competence_id: competence.id,
      doublure_id: doublure.id,
      declared_by: randomItem(managers).id
    });
  }
  if (validationRows.length) {
    const { error } = await supabase
      .from('competence_validations')
      .upsert(validationRows, { onConflict: 'volunteer_cursus_id,competence_id' });
    if (error) throw error;
  }
  log('competence_validations_upserted', { count: validationRows.length });

  log('done', {
    profiles: profiles.length,
    missions: allDemoMissions.length,
    proposals: proposalRows.length,
    assignments: assignmentRows.length,
    volunteerCursus: volunteerCursus.length,
    doublures: doublures.length,
    competenceValidations: validationRows.length
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
