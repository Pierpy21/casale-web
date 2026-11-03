export interface SectionHeadingProps {
  id: string;
  title: string;
}

/** Titolo di sezione della pagina Statistiche: una sola riga, senza eyebrow ridondante. */
export function SectionHeading({ id, title }: SectionHeadingProps) {
  return (
    <h2 id={id} className="text-xl leading-tight">
      {title}
    </h2>
  );
}
