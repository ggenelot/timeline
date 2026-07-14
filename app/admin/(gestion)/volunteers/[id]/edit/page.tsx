'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { AppRole, Skill, SkillCategory } from '@/lib/types';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { getSkillColorClass } from '@/components/skills/skill-badge';
import { Button } from '@/components/ui/button';

type CategoryWithSkills = SkillCategory & { skills: Skill[] };

type EditVolunteerForm = {
  firstName: string;
  lastName: string;
  identifier: string;
  password: string;
  eopeUserId: string;
  selectedSkillByCategory: Record<string, string | null>;
};

type VolunteerPayload = {
  full_name: string | null;
  identifier: string | null;
  role: AppRole;
  eope_user_id?: string | null;
};

type VolunteerSkill = { skill_id: string };

const INITIAL_FORM: EditVolunteerForm = {
  firstName: '',
  lastName: '',
  identifier: '',
  password: '',
  eopeUserId: '',
  selectedSkillByCategory: {},
};

export default function EditVolunteerPage() {
  const params = useParams<{ id: string }>();
  const volunteerId = params.id;
  const router = useRouter();

  const { loading: permissionsLoading, can } = usePermissions();
  const canManage = can('volunteer', 'can_manage');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<EditVolunteerForm>(INITIAL_FORM);
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permissionsLoading) return;

    async function loadData() {
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      if (!canManage) {
        setError('Accès refusé : vous n’avez pas la permission de gérer les bénévoles.');
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError('Session invalide. Veuillez vous reconnecter.');
        setLoading(false);
        return;
      }

      const [volunteerRes, categoriesRes] = await Promise.all([
        fetch(`/api/admin/volunteers/${volunteerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        supabase
          .from('skill_categories')
          .select('id,name,color,display_order,created_at,skills(id,name,display_order,category_id,created_at)')
          .order('display_order', { ascending: true })
          .order('display_order', { referencedTable: 'skills', ascending: true }),
      ]);

      const payload = (await volunteerRes.json()) as {
        error?: string;
        volunteer?: VolunteerPayload;
        profileSkills?: VolunteerSkill[];
      };

      if (!volunteerRes.ok || !payload.volunteer) {
        setError(payload.error ?? 'Impossible de charger le bénévole.');
        setLoading(false);
        return;
      }

      const cats = (categoriesRes.data ?? []) as CategoryWithSkills[];
      setCategories(cats);

      const fullName = payload.volunteer.full_name?.trim() ?? '';
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const firstName = nameParts.shift() ?? '';
      const lastName = nameParts.join(' ');
      const identifier = payload.volunteer.identifier?.trim() ?? '';

      const selectedSkillIds = new Set((payload.profileSkills ?? []).map((ps) => ps.skill_id));

      const selectedSkillByCategory: Record<string, string | null> = {};
      for (const cat of cats) {
        const match = cat.skills
          .filter((s) => selectedSkillIds.has(s.id))
          .sort((a, b) => b.display_order - a.display_order)[0];
        if (match) {
          selectedSkillByCategory[cat.id] = match.id;
        }
      }

      setForm({
        firstName,
        lastName,
        identifier,
        password: '',
        eopeUserId: payload.volunteer.eope_user_id?.trim() ?? '',
        selectedSkillByCategory
      });
      setLoading(false);
    }

    if (volunteerId) void loadData();
  }, [router, volunteerId, permissionsLoading, canManage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!canManage) {
      setError('Accès refusé.');
      return;
    }

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const identifier = form.identifier.trim().toLowerCase();

    if (!firstName) { setError('Le prénom est obligatoire.'); return; }
    if (!lastName) { setError('Le nom est obligatoire.'); return; }
    if (!identifier) { setError("Un identifiant est obligatoire."); return; }
    if (form.password && form.password.length < 10) {
      setError('Le mot de passe doit contenir au moins 10 caractères.');
      return;
    }

    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) { setError('Session invalide.'); setSubmitting(false); return; }

    const skillIds = Object.values(form.selectedSkillByCategory).filter((v): v is string => Boolean(v));

    const response = await fetch(`/api/admin/volunteers/${volunteerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        full_name: `${firstName} ${lastName}`.trim(),
        identifier,
        skill_ids: skillIds,
        password: form.password || undefined,
        eope_user_id: form.eopeUserId.trim() || null,
      }),
    });

    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? 'La mise à jour a échoué.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.push('/admin/volunteers?edited=1');
  }

  if (loading || permissionsLoading) return <p className="text-sm text-ink-2">Chargement...</p>;
  if (!canManage) {
    return (
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        {error ?? 'Accès refusé : vous n’avez pas la permission de gérer les bénévoles.'}
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] text-ink">Modifier un bénévole</h1>
          <p className="mt-1 text-sm text-ink-2">Mettez à jour un compte bénévole avec le même formulaire que la création.</p>
        </div>
        <Link href="/admin/volunteers" className="inline-flex items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-line-field bg-surface-card px-4 py-2 text-sm font-bold text-ink-2 transition hover:bg-[#F4F6FB]">
          Retour à la liste
        </Link>
      </div>

      {error ? <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-ink-2">
            Prénom
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </label>
          <label className="block text-sm text-ink-2">
            Nom
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
              disabled={submitting}
              required
            />
          </label>
        </div>

        <label className="block text-sm text-ink-2">
          Identifiant
          <input
            type="text"
            value={form.identifier}
            onChange={(e) => setForm((prev) => ({ ...prev, identifier: e.target.value }))}
            className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
            placeholder="prenom.nom"
            disabled={submitting}
            required
          />
        </label>

        <label className="block text-sm text-ink-2">
          Mot de passe
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
            disabled={submitting}
            minLength={10}
            autoComplete="new-password"
          />
        </label>

        <label className="block text-sm text-ink-2">
          Identifiant eOPE
          <input
            type="text"
            value={form.eopeUserId}
            onChange={(e) => setForm((prev) => ({ ...prev, eopeUserId: e.target.value }))}
            className="mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm"
            placeholder="Laisser vide si non lié"
            disabled={submitting}
          />
          <span className="mt-1 block text-xs text-ink-3">
            Identifiant du compte eOPE correspondant, pour la synchronisation départementale des équipages (voir Intégration eOPE).
          </span>
        </label>

        <div className="space-y-3 rounded-md border border-line p-3">
          <p className="text-sm font-medium text-ink">Compétences</p>
          {categories.length === 0 ? (
            <p className="text-xs text-ink-3">Aucune catégorie de compétences définie.</p>
          ) : (
            categories.map((category) => {
              if (category.skills.length === 0) return null;
              const selectedSkillId = form.selectedSkillByCategory[category.id] ?? null;
              const selectedSkill = category.skills.find((s) => s.id === selectedSkillId);

              return (
                <div key={category.id} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{category.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({
                        ...prev,
                        selectedSkillByCategory: { ...prev.selectedSkillByCategory, [category.id]: null },
                      }))}
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                        !selectedSkillId ? getSkillColorClass(category.color) : 'border-line-field bg-surface-sub text-ink-2'
                      }`}
                      disabled={submitting}
                    >
                      Aucune
                    </button>
                    {category.skills.map((skill) => {
                      const isHighlighted = selectedSkill
                        ? skill.display_order <= selectedSkill.display_order
                        : false;
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => setForm((prev) => ({
                            ...prev,
                            selectedSkillByCategory: { ...prev.selectedSkillByCategory, [category.id]: skill.id },
                          }))}
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium hover:opacity-80 ${
                            isHighlighted
                              ? getSkillColorClass(category.color)
                              : 'border-line-field bg-surface-sub text-ink-2'
                          }`}
                          disabled={submitting}
                        >
                          {skill.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Mise à jour en cours...' : 'Mettre à jour le bénévole'}
        </Button>
      </form>
    </section>
  );
}
