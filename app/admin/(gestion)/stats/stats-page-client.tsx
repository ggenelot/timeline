'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

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

      if (!profileData || !['admin', 'responsable'].includes(profileData.role as string)) {
        setError('Accès réservé aux administrateurs et responsables.');
        setLoading(false);
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
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Statistiques</h1>
            {global ? (
              <p className="mt-1 text-sm text-slate-600">
                {global.total_volunteers} bénévole{global.total_volunteers !== 1 ? 's' : ''} au total
              </p>
            ) : null}
          </div>
          <div className="flex gap-1 rounded-md border border-slate-200 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-600">Chargement des statistiques...</p>
      ) : global ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Bénévoles actifs', value: global.active_volunteers },
              { label: 'Propositions', value: global.total_proposals },
              { label: 'Taux de réponse', value: formatRate(global.response_rate) },
              { label: 'Confirmés', value: global.total_confirmed },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3 text-right">Taux réponse</th>
                  <th className="px-4 py-3 text-right">Disponible</th>
                  <th className="px-4 py-3 text-right">Indisponible</th>
                  <th className="px-4 py-3 text-right">Sans réponse</th>
                  <th className="px-4 py-3 text-right">Confirmés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byVolunteer.map((v) => (
                  <tr key={v.id} className={v.proposals === 0 ? 'opacity-40' : ''}>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/admin/volunteers/${v.id}`} className="text-slate-900 hover:underline">
                        {v.full_name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${
                        v.response_rate === null ? 'text-slate-400' :
                        v.response_rate >= 80 ? 'text-emerald-700' :
                        v.response_rate >= 50 ? 'text-amber-700' :
                        'text-red-700'
                      }`}>
                        {formatRate(v.response_rate)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-700">{v.available}</td>
                    <td className="px-4 py-2 text-right text-red-700">{v.unavailable}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{v.no_response}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-900">{v.confirmed}</td>
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
