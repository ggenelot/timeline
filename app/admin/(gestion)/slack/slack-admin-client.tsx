'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

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
  return <div className='space-y-4 p-6'><div className='flex items-center justify-between'><h1 className='text-2xl font-semibold'>Admin Slack</h1><a href='/admin/slack/messages' className='rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50'>Gérer les messages par défaut →</a></div><div className='flex gap-2'><button onClick={scan} disabled={loading} className='rounded bg-slate-900 px-3 py-2 text-white'>Scanner les membres Slack</button><button onClick={inviteAll} disabled={sending} className='rounded bg-blue-600 px-3 py-2 text-white'>Inviter tous les membres éligibles</button></div>{error?<p className='text-red-600'>{error}</p>:null}<p>Total Slack: {rows.length} · Liés: {rows.filter(r=>r.timeline_status==='linked').length} · Non liés: {rows.filter(r=>r.timeline_status==='timeline_account_unlinked').length} · Sans compte: {rows.filter(r=>r.timeline_status==='missing_timeline_account').length}</p><p>Comptes Timeline récupérés: {timelineAccounts.length}</p><table className='w-full text-sm'><thead><tr><th>Nom</th><th>Email</th><th>Statut Timeline</th><th>Invitation</th></tr></thead><tbody>{rows.map((r)=><tr key={r.slack_user_id}><td>{r.slack_name}</td><td>{r.slack_email}</td><td>{r.timeline_status}</td><td>{r.status}</td></tr>)}</tbody></table></div>
}
