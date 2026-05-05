'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Row = { slack_user_id:string; slack_email:string|null; slack_name:string|null; timeline_status:string; matched_profile_id:string|null; status:string };

export function SlackAdminClient(){
  const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null);
  const [sending,setSending]=useState(false);
  const scan = async()=>{ setLoading(true); setError(null); const { data:{session} }= await supabase.auth.getSession(); const r = await fetch('/api/admin/slack/sync',{method:'POST',headers:{Authorization:`Bearer ${session?.access_token}`}}); const p=await r.json(); if(!r.ok){setError(p.error);setLoading(false);return;} setRows(p.results??[]); setLoading(false);};
  const inviteAll = async()=>{ setSending(true); const { data:{session} }= await supabase.auth.getSession(); const r = await fetch('/api/admin/slack/send',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify({send_all_pending:true})}); if(!r.ok){const p=await r.json();setError(p.error);} setSending(false); };
  return <div className='space-y-4 p-6'><h1 className='text-2xl font-semibold'>Admin Slack</h1><div className='flex gap-2'><button onClick={scan} disabled={loading} className='rounded bg-slate-900 px-3 py-2 text-white'>Scanner les membres Slack</button><button onClick={inviteAll} disabled={sending} className='rounded bg-blue-600 px-3 py-2 text-white'>Inviter tous les membres éligibles</button></div>{error?<p className='text-red-600'>{error}</p>:null}<p>Total Slack: {rows.length} · Liés: {rows.filter(r=>r.timeline_status==='linked').length} · Non liés: {rows.filter(r=>r.timeline_status==='timeline_account_unlinked').length} · Sans compte: {rows.filter(r=>r.timeline_status==='missing_timeline_account').length}</p><table className='w-full text-sm'><thead><tr><th>Nom</th><th>Email</th><th>Statut Timeline</th><th>Invitation</th></tr></thead><tbody>{rows.map((r)=><tr key={r.slack_user_id}><td>{r.slack_name}</td><td>{r.slack_email}</td><td>{r.timeline_status}</td><td>{r.status}</td></tr>)}</tbody></table></div>
}
