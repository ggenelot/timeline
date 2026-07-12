'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { HelpPage } from '@/lib/types';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';

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
    <div className="rounded-xl border border-line bg-surface-card p-4 shadow-card">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2">Chemin de page *</label>
          <input
            type="text"
            placeholder="Ex. : /missions, /missions/create, /profile"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2">Titre *</label>
          <input
            type="text"
            placeholder="Ex. : Comment proposer sa candidature ?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2">Contenu (Markdown)</label>
          <textarea
            rows={10}
            placeholder={'## Titre de section\n\nExplication en **gras** ou *italique*.\n\n- Point 1\n- Point 2'}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            Annuler
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!path.trim() || !title.trim() || submitting}
        >
          {submitting ? 'Enregistrement…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

export default function AdminHelpPage() {
  const router = useRouter();
  const { loading: permissionsLoading, can } = usePermissions();
  const canManage = can('settings', 'can_manage');
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
    if (permissionsLoading) return;

    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      if (!canManage) { setLoading(false); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);
      await fetchData(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchData, permissionsLoading, canManage]);

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
        title="Pages d'aide"
        subtitle="Configurez le contenu affiché dans la bulle d'aide de chaque page. Le contenu supporte le Markdown (titres, listes, gras, italique)."
      />

      {error ? <div className="rounded-xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}
      {successMsg ? <div className="rounded-xl border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">{successMsg}</div> : null}

      <section className="rounded-2xl border border-line bg-surface-card p-5 shadow-card md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Nouvelle page d&apos;aide</h2>
          {!showCreateForm && (
            <Button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="px-3 py-1.5"
              icon="add"
            >
              Ajouter
            </Button>
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

      <section className="rounded-2xl border border-line bg-surface-card p-5 shadow-card md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Pages configurées</h2>

        {helpPages.length === 0 ? (
          <p className="text-sm text-ink-3">Aucune page d&apos;aide configurée.</p>
        ) : (
          <div className="divide-y divide-line-row overflow-hidden rounded-xl border border-line bg-surface-card">
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
                      <p className="font-medium text-ink">{hp.title}</p>
                      <p className="font-mono text-xs text-ink-3">{hp.page_path}</p>
                      {hp.content && (
                        <p className="line-clamp-2 text-sm text-ink-2">{hp.content}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(hp.id)}
                        className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-sub"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(hp.id, hp.title)}
                        className="rounded-md border border-bad/30 px-2.5 py-1 text-xs text-bad hover:bg-bad-soft"
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
