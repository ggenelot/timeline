import { Suspense } from 'react';
import { ProfilePageClient } from './profile-page-client';

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-600">Chargement...</p>}>
      <ProfilePageClient />
    </Suspense>
  );
}
