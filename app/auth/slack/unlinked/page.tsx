export default function SlackUnlinkedPage() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
      <h1 className="mb-2 text-lg font-semibold">Compte Slack non lié</h1>
      <p>Ce compte Slack n&apos;est pas encore lié à un profil Timeline.</p>
      <p className="mt-2">Connectez-vous avec email/mot de passe puis allez dans Profil pour lier Slack.</p>
      <a className="mt-4 inline-block rounded bg-slate-900 px-3 py-2 text-white" href="/login">Retour à la connexion</a>
    </div>
  );
}
