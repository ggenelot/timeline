'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

type ImportStatus = 'updated' | 'not_found' | 'error';

type ImportResult = {
  name: string;
  status: ImportStatus;
  skillsSet?: number;
  message?: string;
};

type ImportResponse = {
  message?: string;
  totalUpdated?: number;
  totalNotFound?: number;
  results?: ImportResult[];
  error?: string;
};

const STATUS_BADGE: Record<ImportStatus, string> = {
  updated: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  not_found: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  error: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200',
};

const STATUS_LABEL: Record<ImportStatus, string> = {
  updated: 'Mis à jour',
  not_found: 'Introuvable',
  error: 'Erreur',
};

export default function AdminCompetencesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResponse(null);
    setError(null);
  }

  async function handleImport() {
    if (!selectedFile) return;

    setError(null);
    setResponse(null);
    setImporting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setError('Session invalide. Veuillez vous reconnecter.');
        return;
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/admin/import-skills', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = (await res.json()) as ImportResponse;

      if (!res.ok) {
        setError(data.error ?? "L'import a échoué.");
        return;
      }

      setResponse(data);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);
    } catch {
      setError('Une erreur réseau est survenue.');
    } finally {
      setImporting(false);
    }
  }

  if (loadingProfile) {
    return <p className="text-sm text-slate-600">Chargement...</p>;
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : page réservée aux administrateurs.
      </div>
    );
  }

  const updatedResults = response?.results?.filter((r) => r.status === 'updated') ?? [];
  const notFoundResults = response?.results?.filter((r) => r.status === 'not_found') ?? [];
  const errorResults = response?.results?.filter((r) => r.status === 'error') ?? [];

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Importer les compétences</h1>
        <p className="mt-1 text-sm text-slate-500">
          Importez le fichier Excel de suivi des compétences. Les compétences de chaque bénévole seront remplacées par les données du fichier.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Fichier Excel ou CSV
          <span className="ml-1.5 text-xs font-normal text-slate-400">(.xlsx, .xls, .csv)</span>
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={importing}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={!selectedFile || importing}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? 'Import en cours...' : 'Importer les compétences'}
          </button>
        </div>
        {selectedFile ? (
          <p className="mt-2 text-xs text-slate-500">
            Fichier sélectionné : <span className="font-medium text-slate-700">{selectedFile.name}</span>
            {' '}({(selectedFile.size / 1024).toFixed(1)} ko)
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {response ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">{response.message}</p>
          </div>

          {/* Summary counters */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{response.totalUpdated ?? 0}</p>
              <p className="text-xs text-slate-500">mis à jour</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{response.totalNotFound ?? 0}</p>
              <p className="text-xs text-slate-500">introuvable(s)</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-bold text-rose-600">{errorResults.length}</p>
              <p className="text-xs text-slate-500">erreur(s)</p>
            </div>
          </div>

          {/* Detailed results */}
          {(response.results?.length ?? 0) > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">Bénévole</th>
                    <th className="px-4 py-2.5">Statut</th>
                    <th className="px-4 py-2.5 text-right">Compétences</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {updatedResults.map((r) => (
                    <tr key={r.name}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE.updated}`}>
                          {STATUS_LABEL.updated}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{r.skillsSet ?? 0}</td>
                    </tr>
                  ))}
                  {notFoundResults.map((r) => (
                    <tr key={r.name} className="bg-amber-50/40">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE.not_found}`}>
                          {STATUS_LABEL.not_found}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                    </tr>
                  ))}
                  {errorResults.map((r) => (
                    <tr key={r.name} className="bg-rose-50/40">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE.error}`}>
                          {STATUS_LABEL.error}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-rose-600">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {notFoundResults.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <p className="font-medium">Bénévoles introuvables dans l&apos;app :</p>
              <p className="mt-1">
                Vérifiez que le nom dans le fichier correspond exactement au nom complet enregistré dans l&apos;application.
                Les noms non trouvés : {notFoundResults.map((r) => `"${r.name}"`).join(', ')}.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
