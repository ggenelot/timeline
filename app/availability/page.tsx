import { Suspense } from 'react';
import { AvailabilityPageClient } from '@/components/availability/availability-page-client';

export default function AvailabilityPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-2">Chargement...</p>}>
      <AvailabilityPageClient />
    </Suspense>
  );
}
