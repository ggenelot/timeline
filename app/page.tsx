import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Socle MVP - Phase 1</h1>
      <p className="text-slate-700">
        Cette première étape couvre l&apos;authentification, les rôles de base et la lecture de missions de démonstration.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Se connecter
        </Link>
        <Link href="/missions" className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Voir les missions
        </Link>
      </div>
    </div>
  );
}
