import { Suspense } from 'react';
import { VolunteersPageClient } from './volunteers-page-client';

type SearchParams = {
  created?: string;
};

type AdminVolunteersPageProps = {
  searchParams?: SearchParams;
};

export default function AdminVolunteersPage({ searchParams }: AdminVolunteersPageProps) {
  const created = searchParams?.created === '1';

  return (
    <Suspense fallback={<p className="text-sm text-slate-600">Chargement des bénévoles...</p>}>
      <VolunteersPageClient created={created} />
    </Suspense>
  );
}
