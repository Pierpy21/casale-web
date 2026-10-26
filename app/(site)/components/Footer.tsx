import { MapPin, Phone, Mail, Clock } from "lucide-react";
import Image from "next/image";
import { Montserrat } from "next/font/google";

// Stesso marchio "Powered by C.PINSAI" della pagina di accesso al pannello.
const montserrat = Montserrat({ subsets: ["latin"], weight: ["700"], display: "swap" });

/* lucide-react 1.x non include più le icone brand: stessa geometria della vecchia icona, inline. */
function InstagramIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { icon: InstagramIcon, label: "Instagram", href: "#" },
  { icon: FacebookIcon, label: "Facebook", href: "#" },
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
              Richiedi un appuntamento<br />
            </h2>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <a
              href="tel:+393401090100"
              className="font-sans text-[0.8125rem] tracking-widest uppercase font-medium text-[#F7F7F4] bg-[#355A63] hover:bg-[#2A4A52] px-8 py-3.5 rounded-[2px] transition-colors duration-250 no-underline inline-flex items-center"
            >
              Chiama per info
            </a>
            <a
              href="https://wa.me/393401090100"
              className="font-sans text-[0.8125rem] tracking-widest uppercase font-medium text-[#D5D5B7] bg-transparent border border-[#D5D5B7]/35 hover:border-[#D5D5B7]/60 hover:bg-[#D5D5B7]/8 px-8 py-3.5 rounded-[2px] transition-all duration-250 no-underline inline-flex items-center"
            >
              Invia un messaggio
            </a>
          </div>
        </div>

        {/* Main footer grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          
          {/* Logo + description */}
          <div className="space-y-6">
            <div>
              <Image
                      src="/images/logo_vert.svg"
                      alt="Logo del Casale"
                      width={200}
                      height={100}
                      priority
                    />
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
                ["Eventi privati", "#setup"],
                ["Prenota un tavolo", "#footer"],
                ["Area riservata", "/admin/login"],
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
            © {new Date().getFullYear()} Casale del Notaio. Tutti i diritti riservati.
          </p>
          <p className="font-sans text-[0.75rem] text-[#D5D5B7]/35">
            Privacy Policy · Cookie Policy
          </p>
          <a
            href="https://cpinsai.it/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Powered by C.PINSAI"
            className="inline-flex items-baseline gap-2 rounded-[2px] px-2 py-1 no-underline transition-colors duration-300 hover:bg-white/5"
          >
            <span className="font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-[#D5D5B7]/70">Powered by</span>
            <span className={`${montserrat.className} text-[15px] tracking-[0.04em] text-[#FAF1D7]`}>
              C<span className="text-[#E5488A]">.</span>PINSAI
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}