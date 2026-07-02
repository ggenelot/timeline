'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

type Period = '7d' | '30d' | '90d' | 'all';

type GlobalStats = {
  total_volunteers: number;
  active_volunteers: number;
  total_proposals: number;
  response_rate: number | null;
  total_confirmed: number;
};

type VolunteerStats = {
  id: string;
  full_name: string | null;
  identifier: string | null;
  proposals: number;
  responded: number;
  response_rate: number | null;
  available: number;
  maybe: number;
  unavailable: number;
  no_response: number;
  confirmed: number;
};

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 j',
  '30d': '30 j',
  '90d': '90 j',
  'all': 'Tout',
};

const PERIODS: Period[] = ['7d', '30d', '90d', 'all'];

function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${rate} %`;
}

export function StatsPageClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [global, setGlobal] = useState<GlobalStats | null>(null);
  const [byVolunteer, setByVolunteer] = useState<VolunteerStats[]>([]);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (!profileData) {
        setError('Accès réservé aux administrateurs et responsables.');
        setLoading(false);
        return;
      }

      if (profileData.role !== 'admin') {
        const { data: canManage } = await supabase.rpc('has_role_behavior', {
          _user_id: authData.user.id,
          _resource_type: 'mission',
          _behavior: 'can_manage',
        });
        if (!canManage) {
          setError('Accès réservé aux administrateurs et responsables.');
          setLoading(false);
        }
      }
    }
    void checkAuth();
  }, [router]);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setError('Session invalide.'); setLoading(false); return; }

      const res = await fetch(`/api/admin/stats?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? 'Erreur lors du chargement des statistiques.');
        setLoading(false);
        return;
      }

      const body = (await res.json()) as { global: GlobalStats; by_volunteer: VolunteerStats[] };
      setGlobal(body.global);
      setByVolunteer(body.by_volunteer);
      setLoading(false);
    }

    void fetchStats();
  }, [period]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-black tracking-[-0.02em] text-ink">Statistiques</h1>
            {global ? (
              <p className="mt-1 text-sm text-ink-2">
                {global.total_volunteers} bénévole{global.total_volunteers !== 1 ? 's' : ''} au total
              </p>
            ) : null}
          </div>
          <div className="flex gap-1 rounded-md border border-line p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded px-3 py-1 text-sm font-medium transition-colors',
                  period === p
                    ? 'bg-brand text-white'
                    : 'text-ink-2 hover:bg-surface-sub'
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-ink-2">Chargement des statistiques...</p>
      ) : global ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Bénévoles actifs', value: global.active_volunteers },
              { label: 'Propositions', value: global.total_proposals },
              { label: 'Taux de réponse', value: formatRate(global.response_rate) },
              { label: 'Confirmés', value: global.total_confirmed },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-line bg-surface-card p-4 shadow-card">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">{label}</p>
                <p className="mt-1 font-display text-3xl leading-none text-ink">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface-card shadow-card">
            <table className="min-w-full divide-y divide-line-row text-sm">
              <thead className="bg-surface-sub text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-2">
                <tr>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3 text-right">Taux réponse</th>
                  <th className="px-4 py-3 text-right">Disponible</th>
                  <th className="px-4 py-3 text-right">Indisponible</th>
                  <th className="px-4 py-3 text-right">Sans réponse</th>
                  <th className="px-4 py-3 text-right">Confirmés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-row">
                {byVolunteer.map((v) => (
                  <tr key={v.id} className={v.proposals === 0 ? 'opacity-40' : ''}>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/admin/volunteers/${v.id}`} className="text-ink hover:underline">
                        {v.full_name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn(
                        'font-medium',
                        v.response_rate === null ? 'text-ink-3' :
                        v.response_rate >= 80 ? 'text-ok-text' :
                        v.response_rate >= 50 ? 'text-warn-text' :
                        'text-bad'
                      )}>
                        {formatRate(v.response_rate)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-ok-text">{v.available}</td>
                    <td className="px-4 py-2 text-right text-bad">{v.unavailable}</td>
                    <td className="px-4 py-2 text-right text-ink-3">{v.no_response}</td>
                    <td className="px-4 py-2 text-right font-medium text-ink">{v.confirmed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
