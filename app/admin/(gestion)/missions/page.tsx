import { Suspense } from 'react';
import { MissionManagementClient } from './mission-management-client';

export default function MissionManagementPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-2">Chargement...</p>}>
      <MissionManagementClient />
    </Suspense>
  );
}
