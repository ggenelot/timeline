'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { HelpPage, Profile } from '@/lib/types';

function HelpPageForm({
  initialPath = '',
  initialTitle = '',
  initialContent = '',
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: {
  initialPath?: string;
  initialTitle?: string;
  initialContent?: string;
  onSubmit: (data: { page_path: string; title: string; content: string }) => void;
  onCancel?: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const [path, setPath] = useState(initialPath);
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);

  function handleSubmit() {
    if (!path.trim() || !title.trim()) return;
    onSubmit({ page_path: path, title, content });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Chemin de page *</label>
          <input
            type="text"
            placeholder="Ex. : /missions, /missions/create, /profile"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Titre *</label>
          <input
            type="text"
            placeholder="Ex. : Comment proposer sa candidature ?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Contenu (Markdown)</label>
          <textarea
            rows={10}
            placeholder={'## Titre de section\n\nExplication en **gras** ou *italique*.\n\n- Point 1\n- Point 2'}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!path.trim() || !title.trim() || submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Enregistrement…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

export default function AdminHelpPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [helpPages, setHelpPages] = useState<HelpPage[]>([]);
  const [token, setToken] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/help', { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const json = (await res.json()) as { helpPages: HelpPage[] };
      setHelpPages(json.helpPages);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,created_at')
        .eq('id', authData.user.id)
        .single();

      if (!profileData || profileData.role !== 'admin') {
        setLoading(false);
        setProfile(profileData ?? null);
        return;
      }

      setProfile(profileData);
      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);
      await fetchData(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchData]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function handleCreate(data: { page_path: string; title: string; content: string }) {
    setCreating(true);
    setError(null);
    const res = await fetch('/api/admin/help', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowCreateForm(false);
      await fetchData(token);
      flash('Page d\'aide créée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la création.');
    }
    setCreating(false);
  }

  async function handleEdit(id: string, data: { page_path: string; title: string; content: string }) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/help/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditingId(null);
      await fetchData(token);
      flash('Page d\'aide mise à jour.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Supprimer l'aide "${title}" ? Cette action est irréversible.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/help/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchData(token);
      flash('Page d\'aide supprimée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  if (loading) return <p className="text-sm text-slate-600">Chargement…</p>;

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : page réservée aux administrateurs.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pages d&apos;aide</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configurez le contenu affiché dans la bulle d&apos;aide de chaque page. Le contenu supporte le Markdown
          (titres, listes, gras, italique).
        </p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMsg ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMsg}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Nouvelle page d&apos;aide</h2>
          {!showCreateForm && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              + Ajouter
            </button>
          )}
        </div>
        {showCreateForm && (
          <HelpPageForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
            submitting={creating}
            submitLabel="Créer"
          />
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Pages configurées</h2>

        {helpPages.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune page d&apos;aide configurée.</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {helpPages.map((hp) => (
              <div key={hp.id} className="p-4">
                {editingId === hp.id ? (
                  <HelpPageForm
                    initialPath={hp.page_path}
                    initialTitle={hp.title}
                    initialContent={hp.content}
                    onSubmit={(data) => handleEdit(hp.id, data)}
                    onCancel={() => setEditingId(null)}
                    submitting={saving}
                    submitLabel="Enregistrer"
                  />
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-slate-800">{hp.title}</p>
                      <p className="font-mono text-xs text-slate-400">{hp.page_path}</p>
                      {hp.content && (
                        <p className="line-clamp-2 text-sm text-slate-500">{hp.content}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(hp.id)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(hp.id, hp.title)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
