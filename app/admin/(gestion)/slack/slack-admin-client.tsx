'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { initials } from '@/components/ope/atoms';

type Row = {
  slack_user_id: string;
  slack_team_id: string;
  slack_email: string | null;
  slack_name: string | null;
  timeline_status: string;
  matched_profile_id: string | null;
  status: string;
  avatar_url: string | null;
  invitation_id: string | null;
};
type TimelineAccount = { id:string; full_name:string|null; email:string|null; slack_user_id:string|null; slack_team_id:string|null };

const actionButtonClass = 'px-2.5 py-1 text-xs';

const DIACRITICS_RE = new RegExp('[̀-ͯ]', 'g');

function slugify(name: string | null): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

export function SlackAdminClient(){
  const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null);
  const [sending,setSending]=useState(false);
  const [busyRowId,setBusyRowId]=useState<string|null>(null);
  const [linkingRow,setLinkingRow]=useState<Row|null>(null);
  const [createIdentifier,setCreateIdentifier]=useState('');
  const [createSubmitting,setCreateSubmitting]=useState(false);
  const [createError,setCreateError]=useState<string|null>(null);
  const [magicLink,setMagicLink]=useState<string|null>(null);
  const [timelineAccounts,setTimelineAccounts]=useState<TimelineAccount[]>([]);

  const scan = async()=>{
    setLoading(true);
    setError(null);
    try {
      const { data:{session} }= await supabase.auth.getSession();
      const r = await fetch('/api/admin/slack/sync',{method:'POST',headers:{Authorization:`Bearer ${session?.access_token}`}});
      const p=await r.json().catch(()=>({}));
      if(!r.ok){
        setError(p.error ?? p.message ?? `Échec du scan Slack (HTTP ${r.status}).`);
        return;
      }
      setRows(p.results??[]);
      setTimelineAccounts(p.timeline_accounts??[]);
    } catch {
      setError('Impossible de scanner les membres Slack pour le moment.');
    } finally {
      setLoading(false);
    }
  };
  const inviteAll = async()=>{
    setSending(true);
    setError(null);
    try {
      const { data:{session} }= await supabase.auth.getSession();
      const r = await fetch('/api/admin/slack/send',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify({send_all_pending:true})});
      if(!r.ok){
        const p=await r.json().catch(()=>({}));
        setError(p.error ?? p.message ?? `Échec de l'envoi des invitations (HTTP ${r.status}).`);
      }
    } catch {
      setError("Impossible d'envoyer les invitations Slack pour le moment.");
    } finally {
      setSending(false);
    }
  };

  const sendOne = async (row: Row) => {
    if (!row.invitation_id) return;
    setBusyRowId(row.slack_user_id);
    setError(null);
    try {
      const { data:{session} }= await supabase.auth.getSession();
      const r = await fetch('/api/admin/slack/send',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify({invitation_ids:[row.invitation_id]})});
      const p = await r.json().catch(()=>({}));
      if(!r.ok){
        setError(p.error ?? p.message ?? `Échec de l'envoi (HTTP ${r.status}).`);
        return;
      }
      setRows((prev)=>prev.map((x)=>x.slack_user_id===row.slack_user_id?{...x,status:'sent'}:x));
    } catch {
      setError("Impossible d'envoyer l'invitation pour le moment.");
    } finally {
      setBusyRowId(null);
    }
  };

  const linkExisting = async (row: Row) => {
    if (!row.matched_profile_id) return;
    if (!window.confirm(`Lier ce compte Slack au profil Timeline existant (${row.slack_email ?? row.slack_name}) ?`)) return;
    setBusyRowId(row.slack_user_id);
    setError(null);
    try {
      const { data:{session} }= await supabase.auth.getSession();
      const r = await fetch('/api/admin/slack/link-account',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify({slack_user_id:row.slack_user_id,slack_team_id:row.slack_team_id,profile_id:row.matched_profile_id})});
      const p = await r.json().catch(()=>({}));
      if(!r.ok){
        setError(p.error ?? p.message ?? `Échec de la liaison (HTTP ${r.status}).`);
        return;
      }
      setRows((prev)=>prev.map((x)=>x.slack_user_id===row.slack_user_id?{...x,timeline_status:'linked',status:'skipped'}:x));
    } catch {
      setError('Impossible de lier ce compte pour le moment.');
    } finally {
      setBusyRowId(null);
    }
  };

  const openCreateModal = (row: Row) => {
    setLinkingRow(row);
    setCreateIdentifier(slugify(row.slack_name));
    setCreateError(null);
    setMagicLink(null);
  };

  const submitCreate = async () => {
    if (!linkingRow) return;
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const { data:{session} }= await supabase.auth.getSession();
      const r = await fetch('/api/admin/slack/link-account',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify({slack_user_id:linkingRow.slack_user_id,slack_team_id:linkingRow.slack_team_id,slack_name:linkingRow.slack_name,slack_email:linkingRow.slack_email,identifier:createIdentifier})});
      const p = await r.json().catch(()=>({}));
      if(!r.ok){
        setCreateError(p.error ?? p.message ?? `Échec de la création (HTTP ${r.status}).`);
        return;
      }
      setRows((prev)=>prev.map((x)=>x.slack_user_id===linkingRow.slack_user_id?{...x,timeline_status:'linked',status:'skipped'}:x));
      setMagicLink(p.magic_link ?? null);
    } catch {
      setCreateError('Impossible de créer le compte pour le moment.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <div className='space-y-4 p-6'>
      <PageHeader
        title='Admin Slack'
        actions={
          <a
            href='/admin/slack/messages'
            className='inline-flex items-center rounded-[11px] border border-line-field bg-surface-card px-3 py-1.5 text-sm font-bold text-ink-2 hover:bg-surface-sub'
          >
            Gérer les messages par défaut →
          </a>
        }
      />
      <div className='flex gap-2'>
        <Button onClick={scan} disabled={loading}>Scanner les membres Slack</Button>
        <Button variant='engage' onClick={inviteAll} disabled={sending}>Inviter tous les membres éligibles</Button>
      </div>
      {error ? <p className='text-bad'>{error}</p> : null}
      <p className='text-sm text-ink-2'>Total Slack: {rows.length} · Liés: {rows.filter(r=>r.timeline_status==='linked').length} · Non liés: {rows.filter(r=>r.timeline_status==='timeline_account_unlinked').length} · Sans compte: {rows.filter(r=>r.timeline_status==='missing_timeline_account').length}</p>
      <p className='text-sm text-ink-2'>Comptes Timeline récupérés: {timelineAccounts.length}</p>
      <div className='overflow-hidden rounded-2xl border border-line bg-surface-card shadow-card'>
        <table className='w-full text-sm'>
          <thead className='bg-surface-sub text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-2'>
            <tr>
              <th className='px-4 py-3'></th>
              <th className='px-4 py-3'>Nom</th>
              <th className='px-4 py-3'>Email</th>
              <th className='px-4 py-3'>Statut Timeline</th>
              <th className='px-4 py-3'>Invitation</th>
              <th className='px-4 py-3'>Actions</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-line-row'>
            {rows.map((r)=>{
              const isBusy = busyRowId === r.slack_user_id;
              return (
                <tr key={r.slack_user_id}>
                  <td className='px-4 py-2'>
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt='' className='h-7 w-7 rounded-full object-cover' />
                    ) : (
                      <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#E4E8F0] text-[10px] font-semibold text-ink-2'>
                        {initials(r.slack_name)}
                      </span>
                    )}
                  </td>
                  <td className='px-4 py-2 text-ink'>{r.slack_name}</td>
                  <td className='px-4 py-2 text-ink-2'>{r.slack_email}</td>
                  <td className='px-4 py-2 text-ink-2'>{r.timeline_status}</td>
                  <td className='px-4 py-2 text-ink-2'>{r.status}</td>
                  <td className='px-4 py-2'>
                    {r.timeline_status === 'linked' ? (
                      <span className='text-ink-3'>—</span>
                    ) : (
                      <div className='flex flex-wrap gap-1.5'>
                        {r.invitation_id ? (
                          <Button variant='ghost' className={actionButtonClass} onClick={() => sendOne(r)} disabled={isBusy}>
                            {r.status === 'sent' ? 'Renvoyer' : r.status === 'error' ? 'Réessayer' : 'Envoyer'}
                          </Button>
                        ) : null}
                        {r.timeline_status === 'timeline_account_unlinked' && r.matched_profile_id ? (
                          <Button variant='ghost' className={actionButtonClass} onClick={() => linkExisting(r)} disabled={isBusy}>
                            Lier au compte existant
                          </Button>
                        ) : null}
                        {r.timeline_status === 'missing_timeline_account' ? (
                          <Button variant='ghost' className={actionButtonClass} onClick={() => openCreateModal(r)} disabled={isBusy}>
                            Créer un compte lié
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {linkingRow ? (
        <Modal
          title={`Créer un compte lié à ${linkingRow.slack_name ?? 'ce membre Slack'}`}
          onClose={() => setLinkingRow(null)}
          footer={
            magicLink ? (
              <Button onClick={() => setLinkingRow(null)}>Fermer</Button>
            ) : (
              <>
                <Button variant='ghost' onClick={() => setLinkingRow(null)} disabled={createSubmitting}>Annuler</Button>
                <Button onClick={submitCreate} disabled={createSubmitting}>
                  {createSubmitting ? 'Création...' : 'Créer et lier'}
                </Button>
              </>
            )
          }
        >
          {magicLink ? (
            <div className='space-y-2 text-sm'>
              <p className='text-ok-text'>Compte créé et lié avec succès.</p>
              <p className='text-ink-2'>Lien de connexion à transmettre au bénévole :</p>
              <p className='break-all rounded-md bg-surface-sub p-2 text-xs text-ink'>{magicLink}</p>
            </div>
          ) : (
            <div className='space-y-3 text-sm'>
              <p className='text-ink-2'>Email Slack : {linkingRow.slack_email ?? '—'}</p>
              {createError ? <p className='text-bad'>{createError}</p> : null}
              <label className='block text-sm text-ink-2'>
                Identifiant
                <input
                  type='text'
                  value={createIdentifier}
                  onChange={(e) => setCreateIdentifier(e.target.value)}
                  className='mt-1 w-full rounded-[10px] border border-line-field px-3 py-2 text-sm'
                  placeholder='prenom.nom'
                  autoComplete='off'
                  autoCapitalize='none'
                  spellCheck={false}
                  disabled={createSubmitting}
                />
              </label>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
