import { Suspense } from 'react';
import { VolunteersPageClient } from './volunteers-page-client';

type SearchParams = {
  edited?: string;
};

type AdminVolunteersPageProps = {
  searchParams?: SearchParams;
};

export default function AdminVolunteersPage({ searchParams }: AdminVolunteersPageProps) {
  const edited = searchParams?.edited === '1';

  return (
    <Suspense fallback={<p className="text-sm text-ink-2">Chargement des bénévoles...</p>}>
      <VolunteersPageClient edited={edited} />
    </Suspense>
  );
}
