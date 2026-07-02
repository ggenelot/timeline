'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';

type TemplateVariable = { key: string; label: string };

type Template = {
  type: string;
  label: string;
  description: string | null;
  template: string;
  available_variables: TemplateVariable[];
  updated_at: string | null;
};

function TemplateEditor({ tpl, onSaved }: { tpl: Template; onSaved: (type: string, newText: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(tpl.template);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => { setText(tpl.template); }, [tpl.template]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/admin/slack/templates/${tpl.type}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ template: text })
      });
      const p = await r.json().catch(() => ({}));
      if (!r.ok) { setError(p.error ?? `Erreur HTTP ${r.status}`); return; }
      setSuccess(true);
      setEditing(false);
      onSaved(tpl.type, text.trim());
    } catch {
      setError('Impossible de sauvegarder le template.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    setError(null);
    setSuccess(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/admin/slack/templates/${tpl.type}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      const p = await r.json().catch(() => ({}));
      if (!r.ok) { setError(p.error ?? `Erreur HTTP ${r.status}`); return; }
      setText(p.template);
      onSaved(tpl.type, p.template);
      setEditing(false);
      setSuccess(true);
    } catch {
      setError('Impossible de réinitialiser le template.');
    } finally {
      setResetting(false);
    }
  };

  const cancel = () => { setText(tpl.template); setEditing(false); setError(null); setSuccess(false); };

  return (
    <div className="rounded-2xl border border-line bg-surface-card shadow-card">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">{tpl.label}</p>
          {tpl.description && <p className="mt-0.5 text-sm text-ink-2">{tpl.description}</p>}
          {tpl.updated_at && (
            <p className="mt-0.5 text-xs text-ink-3">
              Modifié le {new Date(tpl.updated_at).toLocaleString('fr-FR')}
            </p>
          )}
        </div>
        {!editing && (
          <Button
            variant="ghost"
            onClick={() => { setEditing(true); setSuccess(false); }}
            className="shrink-0 px-3 py-1.5"
          >
            Modifier
          </Button>
        )}
      </div>

      <div className="border-t border-line-row px-4 pb-4 pt-3">
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={text.split('\n').length + 1}
            className="w-full rounded-lg border border-line-field p-2 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        ) : (
          <pre className="whitespace-pre-wrap rounded-lg bg-surface-sub p-3 font-mono text-sm text-ink-2">{text}</pre>
        )}

        {tpl.available_variables.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tpl.available_variables.map((v) => (
              <span
                key={v.key}
                title={v.label}
                className="cursor-default rounded bg-surface-sub px-2 py-0.5 font-mono text-xs text-ink-2"
              >
                {`{{${v.key}}}`}
              </span>
            ))}
          </div>
        )}

        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        {success && !editing && <p className="mt-2 text-sm text-ok-text">Sauvegardé.</p>}

        {editing && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={save}
              disabled={saving || text.trim() === ''}
              className="px-3 py-1.5"
            >
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </Button>
            <Button
              variant="ghost"
              onClick={reset}
              disabled={resetting}
              className="px-3 py-1.5"
            >
              {resetting ? 'Réinitialisation…' : 'Réinitialiser par défaut'}
            </Button>
            <Button
              variant="ghost"
              onClick={cancel}
              className="px-3 py-1.5"
            >
              Annuler
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SlackMessagesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch('/api/admin/slack/templates', {
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });
        const p = await r.json().catch(() => ({}));
        if (!r.ok) { setError(p.error ?? `Erreur HTTP ${r.status}`); return; }
        setTemplates(p.templates ?? []);
      } catch {
        setError('Impossible de charger les templates.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaved = (type: string, newText: string) => {
    setTemplates((prev) => prev.map((t) => t.type === type ? { ...t, template: newText, updated_at: new Date().toISOString() } : t));
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Admin Slack"
        subtitle={
          <>
            Personnalisez les messages envoyés automatiquement par le bot Slack.
            Utilisez les variables <code className="rounded bg-surface-sub px-1 font-mono text-xs text-ink-2">{'{{variable}}'}</code> pour insérer des valeurs dynamiques.
            Une ligne contenant une variable sans valeur est automatiquement supprimée du message.
          </>
        }
      />

      {loading && <p className="text-sm text-ink-2">Chargement des templates…</p>}
      {error && <p className="text-sm text-bad">{error}</p>}

      {!loading && !error && (
        <div className="space-y-4">
          {templates.map((tpl) => (
            <TemplateEditor key={tpl.type} tpl={tpl} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </div>
  );
}
