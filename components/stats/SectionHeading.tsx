export interface SectionHeadingProps {
  id: string;
  eyebrow: string;
  title: string;
}

/** Intestazione di sezione della pagina Statistiche (eyebrow bronze + titolo serif). */
export function SectionHeading({ id, eyebrow, title }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-1 border-b border-sand pb-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{eyebrow}</p>
      <h2 id={id} className="text-2xl">
        {title}
      </h2>
    </div>
  );
}
