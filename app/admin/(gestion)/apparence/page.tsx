'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { Card, PageHeader } from '@/components/ui/card';

type SettingsForm = {
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  fontSans: string;
  fontDisplay: string;
  fontHand: string;
  orgName: string;
  orgTagline: string;
  loginGreeting: string;
  baseUrl: string;
};

type SettingsRow = {
  logo_url: string | null;
  brand_color: string;
  accent_color: string;
  font_sans: string | null;
  font_display: string | null;
  font_hand: string | null;
  org_name: string;
  org_tagline: string;
  login_greeting: string;
  base_url: string | null;
};

const EMPTY_FORM: SettingsForm = {
  logoUrl: '',
  brandColor: '#002D74',
  accentColor: '#FF7F30',
  fontSans: '',
  fontDisplay: '',
  fontHand: '',
  orgName: 'Protec du 8 & du 9',
  orgTagline: 'Protection Civile Paris Seine',
  loginGreeting: 'contente de te revoir',
  baseUrl: ''
};

function toForm(row: SettingsRow): SettingsForm {
  return {
    logoUrl: row.logo_url ?? '',
    brandColor: row.brand_color,
    accentColor: row.accent_color,
    fontSans: row.font_sans ?? '',
    fontDisplay: row.font_display ?? '',
    fontHand: row.font_hand ?? '',
    orgName: row.org_name,
    orgTagline: row.org_tagline,
    loginGreeting: row.login_greeting,
    baseUrl: row.base_url ?? ''
  };
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-2">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-line-field bg-surface-sub p-1"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
    </div>
  );
}

function FontField({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <p className="mt-1 text-xs text-ink-3">Nom d&apos;une police Google Fonts. Laisser vide pour la police par défaut ({placeholder}).</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  help
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {help ? <p className="mt-1 text-xs text-ink-3">{help}</p> : null}
    </div>
  );
}

export default function AdminApparencePage() {
  const router = useRouter();
  const { loading: permissionsLoading, can } = usePermissions();
  const canManage = can('settings', 'can_manage');
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSettings = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const json = (await res.json()) as { settings: SettingsRow };
      setForm(toForm(json.settings));
    }
  }, []);

  useEffect(() => {
    if (permissionsLoading) return;

    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      if (!canManage) { setLoading(false); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);
      await fetchSettings(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchSettings, permissionsLoading, canManage]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logoUrl: form.logoUrl || null,
        brandColor: form.brandColor,
        accentColor: form.accentColor,
        fontSans: form.fontSans || null,
        fontDisplay: form.fontDisplay || null,
        fontHand: form.fontHand || null,
        orgName: form.orgName,
        orgTagline: form.orgTagline,
        loginGreeting: form.loginGreeting,
        baseUrl: form.baseUrl || null
      })
    });

    if (res.ok) {
      flash('Charte graphique mise à jour.');
      // Recharge pour ré-appliquer la charte (BrandingProvider ne lit qu'au montage).
      setTimeout(() => window.location.reload(), 600);
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? 'Erreur lors de l’enregistrement.');
    }
    setSaving(false);
  }

  if (loading || permissionsLoading) return <p className="text-sm text-ink-2">Chargement…</p>;

  if (!canManage) {
    return (
      <div className="rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : vous n&apos;avez pas la permission de gérer les réglages.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Apparence"
        subtitle="Personnalisez le logo, les couleurs de marque, les polices et les textes de la page de connexion sans toucher au code. Ces réglages s'appliquent à toute l'application, y compris avant connexion."
      />

      {error ? <div className="rounded-xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}
      {successMsg ? <div className="rounded-xl border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">{successMsg}</div> : null}

      <Card className="p-5 md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Logo</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-sub">
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu d'une URL saisie librement */}
            <img src={form.logoUrl || '/logo.png'} alt="Aperçu du logo" className="h-14 w-14 object-contain" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-2">URL du logo</label>
            <input
              type="text"
              value={form.logoUrl}
              onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
              placeholder="https://exemple.org/logo.png"
              className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <p className="mt-1 text-xs text-ink-3">Laisser vide pour garder le logo par défaut ({'/logo.png'}).</p>
          </div>
        </div>
      </Card>

      <Card className="p-5 md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Couleurs</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Couleur de marque (principale)" value={form.brandColor} onChange={(v) => setForm((f) => ({ ...f, brandColor: v }))} />
          <ColorField label="Couleur d'accent (actions, mise en avant)" value={form.accentColor} onChange={(v) => setForm((f) => ({ ...f, accentColor: v }))} />
        </div>
      </Card>

      <Card className="p-5 md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Polices</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FontField label="Police principale (texte)" value={form.fontSans} placeholder="Source Sans 3" onChange={(v) => setForm((f) => ({ ...f, fontSans: v }))} />
          <FontField label="Police des titres" value={form.fontDisplay} placeholder="Anton" onChange={(v) => setForm((f) => ({ ...f, fontDisplay: v }))} />
          <FontField label="Police décorative" value={form.fontHand} placeholder="Beth Ellen" onChange={(v) => setForm((f) => ({ ...f, fontHand: v }))} />
        </div>
      </Card>

      <Card className="p-5 md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Textes de la page de connexion</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Nom de l'association" value={form.orgName} onChange={(v) => setForm((f) => ({ ...f, orgName: v }))} help="Affiché en grand sous le logo." />
          <TextField label="Slogan" value={form.orgTagline} onChange={(v) => setForm((f) => ({ ...f, orgTagline: v }))} help="Affiché sous le nom de l'association." />
          <TextField label="Message d'accueil" value={form.loginGreeting} onChange={(v) => setForm((f) => ({ ...f, loginGreeting: v }))} help="Affiché sous « Connexion »." />
        </div>
      </Card>

      <Card className="p-5 md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Adresse de l&apos;application</h2>
        <label className="mb-1 block text-xs font-medium text-ink-2">URL de base</label>
        <input
          type="url"
          inputMode="url"
          value={form.baseUrl}
          onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
          placeholder="https://timeline.mon-asso.fr"
          className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-xs text-ink-3">
          Adresse publique de Timeline, utilisée pour construire les liens des messages Slack (par ex. le lien de connexion
          envoyé lors de la création d&apos;un compte). Sans base configurée, ces liens sont incomplets. Ne pas mettre de
          slash final.
        </p>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
