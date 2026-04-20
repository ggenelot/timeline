import { AdminVolunteersClient } from './admin-volunteers-client';

type AdminVolunteersPageProps = {
  searchParams?: {
    created?: string;
  };
};

export default function AdminVolunteersPage({ searchParams }: AdminVolunteersPageProps) {
  const created = searchParams?.created === '1';

  return <AdminVolunteersClient created={created} />;
}
