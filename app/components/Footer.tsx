import { Instagram, Facebook, MapPin, Phone, Mail, Clock } from "lucide-react";

const SOCIAL_LINKS = [
  { icon: Instagram, label: "Instagram", href: "#" },
  { icon: Facebook, label: "Facebook", href: "#" },
];

const HOURS = [
  { days: "Mercoledì – Giovedì", time: "16:30 – 23:30" },
  { days: "Venerdì", time: "16:00 – 23:30" },
  { days: "Sabato", time: "12:00 – 23:30" },
  { days: "Domenica", time: "10:00 – 23:30" },
  { days: "Lunedì - Martedì", time: "Chiuso" },
];

export function Footer() {
  return (
    <footer id="footer" className="bg-[#1C2B2D] text-[#D5D5B7] pt-24 pb-12">
      <div className="max-w-[1280px] mx-auto px-8">

        {/* Top CTA banner */}
        <div className="border-t border-b border-[#D5D5B7]/15 py-14 mb-16 flex flex-wrap items-center justify-between gap-8">
          <div>
            <p className="font-sans text-[0.6875rem] tracking-[0.22em] uppercase text-[#8B6B4A] mb-3">
              Pianifica la tua visita
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-medium text-[#F7F7F4] leading-tight">
              Prenota il tuo tavolo<br />
              <em className="text-[#D5D5B7] not-italic italic">o uno spazio privato</em>
            </h2>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <a
              href="tel:+39000000000"
              className="font-sans text-[0.8125rem] tracking-widest uppercase font-medium text-[#F7F7F4] bg-[#355A63] hover:bg-[#2A4A52] px-8 py-3.5 rounded-[2px] transition-colors duration-250 no-underline inline-flex items-center"
            >
              Chiama per prenotare
            </a>
            <a
              href="mailto:info@casaledelnotaio.it"
              className="font-sans text-[0.8125rem] tracking-widest uppercase font-medium text-[#D5D5B7] bg-transparent border border-[#D5D5B7]/35 hover:border-[#D5D5B7]/60 hover:bg-[#D5D5B7]/8 px-8 py-3.5 rounded-[2px] transition-all duration-250 no-underline inline-flex items-center"
            >
              Manda una richiesta
            </a>
          </div>
        </div>

        {/* Main footer grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          
          {/* Logo + description */}
          <div className="space-y-6">
            <div>
              <div className="font-serif text-2xl font-medium text-[#D5D5B7] tracking-wide leading-none">
                CASALE
              </div>
              <div className="font-serif text-[0.7rem] tracking-[0.28em] font-normal text-[#8B6B4A] uppercase mt-1">
                DEL NOTAIO
              </div>
            </div>
            <p className="font-sans text-sm leading-relaxed text-[#D5D5B7]/60 max-w-[260px]">
              Una storica tenuta siciliana dedita ai piaceri della tavola, al calore dell'ospitalità e all'arte del celebrare.
               </p>
            {/* Social links */}
            <div className="flex gap-3">
              {SOCIAL_LINKS.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-9 h-9 border border-[#D5D5B7]/20 rounded-[2px] flex items-center justify-center text-[#D5D5B7]/60 hover:text-[#D5D5B7] hover:border-[#D5D5B7]/50 transition-all duration-200 no-underline"
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-sans text-[0.6875rem] tracking-[0.2em] uppercase text-[#8B6B4A] mb-5">
              Contatti
            </h4>
            <ul className="list-none p-0 m-0 space-y-3.5">
              <li className="flex items-start gap-2.5">
                <MapPin size={14} className="text-[#D5D5B7] mt-1 shrink-0" />
                <span className="font-sans text-sm leading-relaxed text-[#D5D5B7]">
                  Via Nicolosi 67<br />
                  95032, Belpasso (CT)<br />
                  Sicilia, Italia
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone size={14} className="text-[#D5D5B7] shrink-0" />
                <a
                  href="tel:+393401090100"
                  className="font-sans text-sm text-[#D5D5B7] hover:text-[#D5D5B7]/7 no-underline transition-colors duration-200"
                >
                  +39 340 109 0100
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail size={14} className="text-[#D5D5B7] shrink-0" />
                <a
                  href="mailto:info@casaledelnotaio.it"
                  className="font-sans text-sm text-[#D5D5B7] hover:text-[#D5D5B7]/7 no-underline transition-colors duration-200"
                >
                  info@casaledelnotaio.it
                </a>
              </li>
            </ul>
          </div>

          {/* Opening Hours */}
          <div>
            <h4 className="font-sans text-[0.6875rem] tracking-[0.2em] uppercase text-[#8B6B4A] mb-5 flex items-center gap-2">
              <Clock size={12} />
              Orari di apertura
            </h4>
            <ul className="list-none p-0 m-0 space-y-3">
              {HOURS.map(({ days, time }) => (
                <li key={days}>
                  <div className="font-sans text-[0.8125rem] text-[#D5D5B7]/85 mb-0.5">
                    {days}
                  </div>
                  <div className="font-sans text-[0.75rem] text-[#D5D5B7]/50">
                    {time}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-sans text-[0.6875rem] tracking-[0.2em] uppercase text-[#8B6B4A] mb-5">
              Esplora
            </h4>
            <ul className="list-none p-0 m-0 space-y-3">
              {[
                ["Menù", "#menus"],
                ["La nostra storia", "#story"],
                ["Location & Spazi", "#spaces"],
                ["Eventi privati", "#spaces"],
                ["Prenota un tavolo", "#footer"],
              ].map(([label, href]) => (
                <li key={label}>
                  <a
                    href={href}
                    className="font-sans text-sm text-[#D5D5B7]/65 hover:text-[#D5D5B7] no-underline transition-colors duration-200"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#D5D5B7]/10 pt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="font-sans text-[0.75rem] text-[#D5D5B7]/35">
            © {new Date().getFullYear()} Casale del Notaio. Tutti i diritti riservati. Designed by <a href="https://www.instagram.com/pellegrinopierpaolo" className="text-[#D5D5B7]/65 hover:text-[#D5D5B7] no-underline transition-colors duration-200">Pierpy</a>.
          </p>
          <p className="font-sans text-[0.75rem] text-[#D5D5B7]/35">
            Privacy Policy · Cookie Policy
          </p>
        </div>
      </div>
    </footer>
  );
}