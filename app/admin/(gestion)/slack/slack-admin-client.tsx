'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';

type Row = { slack_user_id:string; slack_email:string|null; slack_name:string|null; timeline_status:string; matched_profile_id:string|null; status:string };
type TimelineAccount = { id:string; full_name:string|null; email:string|null; slack_user_id:string|null; slack_team_id:string|null };

export function SlackAdminClient(){
  const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null);
  const [sending,setSending]=useState(false);
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
              <th className='px-4 py-3'>Nom</th>
              <th className='px-4 py-3'>Email</th>
              <th className='px-4 py-3'>Statut Timeline</th>
              <th className='px-4 py-3'>Invitation</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-line-row'>
            {rows.map((r)=>(
              <tr key={r.slack_user_id}>
                <td className='px-4 py-2 text-ink'>{r.slack_name}</td>
                <td className='px-4 py-2 text-ink-2'>{r.slack_email}</td>
                <td className='px-4 py-2 text-ink-2'>{r.timeline_status}</td>
                <td className='px-4 py-2 text-ink-2'>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
