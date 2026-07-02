'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { VerificationCardStack } from '@/components/verification/verification-card-stack';
import { MissionMaterielVerificationItemStatus, MissionVerificationCard, MissionVerificationDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export default function VerificationMissionPage() {
  const params = useParams<{ missionId: string }>();
  const router = useRouter();
  const missionId = params.missionId;

  const [detail, setDetail] = useState<MissionVerificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.replace('/login');
      return;
    }

    const token = await getAccessToken();
    const res = await fetch(`/api/verification/missions/${missionId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? 'Impossible de charger la vérification de cette mission.');
      setLoading(false);
      return;
    }

    const data = (await res.json()) as MissionVerificationDetail;
    setDetail(data);
    setLoading(false);
  }, [missionId, router]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function handleDecide(card: MissionVerificationCard, status: MissionMaterielVerificationItemStatus, note: string | null) {
    if (!detail) return;
    setSaving(true);
    setError(null);

    const token = await getAccessToken();
    const res = await fetch(`/api/verification/missions/${missionId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        mission_materiel_assignment_id: card.mission_materiel_assignment_id,
        child_type_id: card.child_type_id,
        status,
        note
      })
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? 'Impossible d’enregistrer ce pointage.');
      setSaving(false);
      return;
    }

    setDetail((current) => {
      if (!current) return current;
      return {
        ...current,
        verification: current.verification ?? { id: '', mission_id: missionId, status: 'in_progress', completed_by: null, completed_at: null, created_at: '', updated_at: '' },
        cards: current.cards.map((c) =>
          c.mission_materiel_assignment_id === card.mission_materiel_assignment_id && c.child_type_id === card.child_type_id
            ? { ...c, check: { status, note } }
            : c
        )
      };
    });
    setSaving(false);
  }

  async function handleComplete() {
    setSaving(true);
    setError(null);
    const token = await getAccessToken();
    const res = await fetch(`/api/verification/missions/${missionId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? 'Impossible de terminer la vérification.');
      setSaving(false);
      return;
    }

    await loadDetail();
    setSaving(false);
  }

  async function handleReopen() {
    setSaving(true);
    setError(null);
    const token = await getAccessToken();
    const res = await fetch(`/api/verification/missions/${missionId}/reopen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? 'Impossible de relancer la vérification.');
      setSaving(false);
      return;
    }

    await loadDetail();
    setSaving(false);
  }

  if (loading) {
    return <p className="text-sm text-ink-2">Chargement de la vérification...</p>;
  }

  if (error && !detail) {
    return <p className="text-sm text-bad">{error}</p>;
  }

  if (!detail) {
    return null;
  }

  if (detail.cards.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Link href="/verification" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <Icon name="arrow_back" size={18} />
          Retour
        </Link>
        <p className="text-sm text-ink-2">Aucun matériel requis n’est défini sur cette mission.</p>
      </div>
    );
  }

  const isCompleted = detail.verification?.status === 'completed';
  const missingCards = detail.cards.filter((card) => card.check?.status === 'missing');
  const allChecked = detail.cards.every((card) => card.check !== null);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/verification" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
        <Icon name="arrow_back" size={18} />
        Retour
      </Link>

      {error ? <p className="text-sm text-bad">{error}</p> : null}

      {isCompleted ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-ok-line bg-ok-soft p-4">
            <p className="text-sm font-semibold text-ok-text">Vérification terminée.</p>
            {missingCards.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-sm text-ok-text">
                {missingCards.map((card) => (
                  <li key={`${card.mission_materiel_assignment_id}:${card.child_type_id}`}>
                    {card.category_name} — {card.container_name} — {card.child_name}
                    {card.check?.note ? ` (${card.check.note})` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ok-text">Tout le matériel était présent.</p>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={() => void handleReopen()}
            disabled={saving}
            className="self-start"
          >
            Refaire la vérification
          </Button>
        </div>
      ) : allChecked ? (
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <p className="text-sm font-semibold text-ink">Tous les items ont été pointés.</p>
            {missingCards.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-sm text-bad">
                {missingCards.map((card) => (
                  <li key={`${card.mission_materiel_assignment_id}:${card.child_type_id}`}>
                    {card.category_name} — {card.container_name} — {card.child_name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ok-text">Tout le matériel est présent.</p>
            )}
          </Card>
          <Button
            variant="engage"
            icon="check"
            onClick={() => void handleComplete()}
            disabled={saving}
            className="self-start"
          >
            Terminer la vérification
          </Button>
        </div>
      ) : (
        <VerificationCardStack cards={detail.cards} onDecide={handleDecide} saving={saving} />
      )}
    </div>
  );
}
