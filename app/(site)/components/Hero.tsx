"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Menu", href: "#menus" },
  { label: "La nostra storia", href: "#story" },
  { label: "Spazi", href: "#spaces" },
  { label: "Contatti", href: "#footer" },
];

export function Hero() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[100dvh] flex flex-col bg-[#1C2B2D]">
      {/* Hero background image */}
      <div className="absolute inset-0 overflow-hidden">
        <Image
  src="/images/mise-en-place/first.webp"
  alt="Elegant dining room with arched windows at Casale del Notaio"
  fill
  priority
  sizes="100vw"
  className="object-cover opacity-35"
/>
        <div className="absolute inset-0 bg-gradient-to-b from-[#1C2B2D]/60 via-[#1C2B2D]/30 to-[#1C2B2D]/80" />
      </div>

      {/* Navigation */}
      <nav className="relative z-30 flex items-center justify-between px-6 py-6 md:px-16">
        {/* Logo fisso senza responsive */}
        <div className="relative w-[200px] h-[50px]">
          <Image
            src="/images/logo_vert.svg"
            alt="Logo del Casale"
            fill
            className="object-contain object-left"
            priority
          />
        </div>

        {/* Desktop Nav */}
        <ul className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <button
                onClick={() => scrollTo(link.href)}
                className="font-sans text-[0.8125rem] tracking-widest uppercase text-[#D5D5B7]/85 hover:text-[#D5D5B7] transition-colors duration-200"
              >
                {link.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Reserve CTA (Desktop) */}
        <button
          onClick={() => scrollTo("#footer")}
          className="hidden md:inline-flex items-center font-sans text-[0.75rem] tracking-widest uppercase text-[#F7F7F4] border border-[#D5D5B7]/40 hover:border-[#D5D5B7]/70 hover:bg-[#D5D5B7]/10 px-5 py-2 rounded-[2px] transition-all duration-250"
        >
          Contattaci
        </button>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-[#D5D5B7] p-2 -mr-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={26} /> : <Menu size={26} />}
        </button>
      </nav>

      {/* Mobile menu overlay istantaneo (Senza animazioni/transizioni) */}
      {mobileOpen && (
        <div className="absolute top-[80px] left-0 w-full bg-[#1C2B2D]/55 backdrop-blur-md border-b border-[#D5D5B7]/10 z-20 md:hidden">
          <div className="flex flex-col px-8 py-8 gap-6">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollTo(link.href)}
                className="font-sans text-sm tracking-[0.2em] uppercase text-[#D5D5B7] text-left w-full border-b border-[#D5D5B7]/10 pb-4"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero content */}
      <div className="relative z-10 flex flex-col flex-1 justify-end px-6 pb-24 md:px-16 md:pb-28 max-w-5xl">
        <p className="font-sans text-[0.6875rem] md:text-[0.75rem] tracking-[0.22em] uppercase text-[#F7F7F4] mb-4 md:mb-6">
          Eventi esclusivi · Sicilia
        </p>

        <h1 className="text-[#F7F7F4] text-4xl md:text-6xl font-serif mb-6 max-w-[780px] leading-[1.15]">
          Dove ogni stagione<br />
          <em className="text-[#D5D5B7] font-serif italic">racconta una storia</em>
        </h1>

        {/* CTAs */}
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          <CTAPrimary onClick={() => scrollTo("#menus")} className="w-full md:w-auto">
            Vedi i menu
          </CTAPrimary>
          <CTASecondary onClick={() => scrollTo("#spaces")} className="w-full md:w-auto">
            Esplora il luogo
          </CTASecondary>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 opacity-50 hidden md:flex" aria-hidden>
        <div className="w-[1px] h-12 bg-gradient-to-b from-transparent to-[#D5D5B7]" />
      </div>
    </section>
  );
}

export function CTAPrimary({
  children,
  onClick,
  href,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const baseClass = `inline-flex items-center justify-center font-sans text-[0.8125rem] tracking-widest uppercase font-medium text-[#F7F7F4] bg-[#355A63] hover:bg-[#2A4A52] px-8 py-3.5 rounded-[2px] transition-colors duration-250 no-underline ${className}`;

  if (href) return <a href={href} className={baseClass}>{children}</a>;
  return <button onClick={onClick} className={baseClass}>{children}</button>;
}

export function CTASecondary({
  children,
  onClick,
  href,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const baseClass = `inline-flex items-center justify-center font-sans text-[0.8125rem] tracking-widest uppercase font-medium text-[#D5D5B7] border border-[#D5D5B7]/50 hover:border-[#D5D5B7]/80 hover:bg-[#D5D5B7]/10 px-8 py-3.5 rounded-[2px] transition-all duration-250 no-underline ${className}`;

  if (href) return <a href={href} className={baseClass}>{children}</a>;
  return <button onClick={onClick} className={baseClass}>{children}</button>;
}