export default function SlackUnlinkedPage() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-warn-line bg-warn-soft p-6 text-sm text-warn-text">
      <h1 className="mb-2 text-lg font-bold text-ink">Compte Slack non lié</h1>
      <p>Ce compte Slack n&apos;est pas encore lié à un profil Timeline.</p>
      <p className="mt-2">Connectez-vous avec email/mot de passe puis allez dans Profil pour lier Slack.</p>
      <a className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-[11px] bg-brand px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-6px_rgba(0,45,116,.5)] transition hover:bg-[#013A8F]" href="/login">Retour à la connexion</a>
    </div>
  );
}
