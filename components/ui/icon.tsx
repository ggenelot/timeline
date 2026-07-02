import { cn } from '@/lib/cn';

/**
 * Icône Material Symbols Rounded (ligature).
 * La police est chargée dans app/layout.tsx et la classe de base définie dans globals.css.
 * La taille pilote aussi l'axe optique (opsz) via font-size.
 */
export function Icon({
  name,
  size = 20,
  className,
  title
}: {
  name: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn('material-symbols-rounded', className)}
      style={{ fontSize: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {name}
    </span>
  );
}
