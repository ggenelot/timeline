'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

// Confirmation affichée quand on affecte, depuis le board, un bénévole qui
// n'a pas de disponibilité déclarée sur CETTE mission précise (mais qui
// s'est mis dispo le même jour, sur une autre mission, ou vient du pool du
// jour). Reproduit le comportement admin de la fiche mission : rendre le
// bénévole disponible (avec notification Slack) puis l'affecter.
export function MarkAvailableConfirmModal({
  volunteerLabel,
  roleName,
  loading,
  onCancel,
  onConfirm,
}: {
  volunteerLabel: string;
  roleName: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onCancel}
      title="Rendre disponible et affecter ?"
      maxWidth={420}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={loading} disabled={loading}>
            Rendre disponible et affecter
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-[1.5] text-ink-2">
        <strong className="text-ink">{volunteerLabel}</strong> n&apos;a pas encore de disponibilité déclarée sur cette mission
        précise. Le·la marquer disponible ici (un message Slack lui sera envoyé, comme depuis la fiche mission) puis
        l&apos;affecter au créneau <strong className="text-ink">{roleName}</strong> ?
      </p>
    </Modal>
  );
}
