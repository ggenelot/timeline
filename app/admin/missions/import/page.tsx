'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionImportPreview, buildMissionsPreview, parseCsvContent } from '@/lib/import-missions';
import { Profile } from '@/lib/types';

export default function AdminMissionImportPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<MissionImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.replace('/login');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        setError('Impossible de charger votre profil.');
        setLoadingProfile(false);
        return;
      }

      setProfile(profileData);
      setLoadingProfile(false);
    }

    void loadProfile();
  }, [router]);

  const validMissions = useMemo(
    () =>
      preview?.items
        .filter((item): item is typeof item & { normalized: NonNullable<typeof item.normalized> } => item.isValid && item.normalized !== null)
        .map((item) => item.normalized) ?? [],
    [preview]
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);
    setPreview(null);

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setAnalyzing(true);
    setFileName(file.name);

    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith('.csv');

    if (!isCsv) {
      setError('Cette V1 accepte uniquement les fichiers .csv dans cet environnement.');
      setAnalyzing(false);
      return;
    }

    const content = await file.text();
    const rows = parseCsvContent(content);
    const nextPreview = buildMissionsPreview(rows);

    setPreview(nextPreview);
    setAnalyzing(false);
  }

  async function handleImport() {
    setError(null);
    setSuccess(null);

    if (!profile || profile.role !== 'admin') {
      setError('Accès refusé : seuls les admins peuvent importer.');
      return;
    }

    if (validMissions.length === 0) {
      setError('Aucune mission valide à importer.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setError('Session invalide. Veuillez vous reconnecter.');
      return;
    }

    setImporting(true);

    try {
      const response = await fetch('/api/admin/missions/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ missions: validMissions })
      });

      const payload = (await response.json()) as { error?: string; imported?: number; detected?: number; importBatchId?: string };

      if (!response.ok) {
        setError(payload.error ?? 'Import impossible.');
        return;
      }

      setSuccess(
        `Import terminé : ${payload.detected ?? validMissions.length} missions valides détectées, ${payload.imported ?? 0} importées. Batch: ${payload.importBatchId ?? 'n/a'}.`
      );
    } finally {
      setImporting(false);
    }
  }

  if (loadingProfile) {
    return <p className="text-sm text-slate-600">Chargement...</p>;
  }

  if (!profile || profile.role !== 'admin') {
    return <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Accès refusé : page réservée aux admins.</p>;
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Importer des missions</h1>
        <p className="text-sm text-slate-600">Import en bloc depuis un fichier CSV avec prévisualisation avant insertion.</p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="rounded-md border border-slate-200 p-3">
        <label className="block text-sm text-slate-700">
          Fichier (.csv, .xlsx, .xls)
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={analyzing || importing}
            className="mt-1 block w-full text-sm"
          />
        </label>
        {fileName ? <p className="mt-2 text-xs text-slate-500">Fichier sélectionné : {fileName}</p> : null}
      </div>

      {preview ? (
        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p>{preview.totalDetected} missions détectées</p>
            <p>{preview.totalValid} missions valides</p>
            <p>{preview.totalErrors} erreurs bloquantes</p>
          </div>

          <div className="space-y-3">
            {preview.items.map((item) => (
              <article key={`${item.block.blockIndex}-${item.block.source}`} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  Bloc #{item.block.blockIndex + 1} — {item.isValid ? 'Valide' : 'Invalide'}
                </p>
                {item.normalized ? (
                  <ul className="mt-2 space-y-1 text-slate-700">
                    <li>Titre: {item.normalized.title}</li>
                    <li>DO Status: {item.normalized.do_status ?? '—'}</li>
                    <li>Début: {new Date(item.normalized.starts_at).toLocaleString('fr-FR')}</li>
                    <li>Fin: {new Date(item.normalized.ends_at).toLocaleString('fr-FR')}</li>
                    <li>Lieu: {item.normalized.location ?? '—'}</li>
                    <li>Catégorie: {item.normalized.category}</li>
                  </ul>
                ) : null}

                {item.issues.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {item.issues.map((issue, issueIndex) => (
                      <li key={`${issue.code}-${issueIndex}`} className={issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}>
                        {issue.severity === 'error' ? 'Erreur' : 'Warning'}: {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={importing || validMissions.length === 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? 'Import en cours...' : `Importer les missions valides (${validMissions.length})`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
