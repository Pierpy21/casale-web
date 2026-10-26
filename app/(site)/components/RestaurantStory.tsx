"use client";

import React, { useState } from "react";

const STORY_PILLARS = [
  {
    label: "Filosofia",
    text: "Crediamo che un pasto non sia mai solo cibo. È un momento sospeso nel tempo — un rituale di condivisione, di degustazione, di memoria. Ogni piatto che esce dalla nostra cucina porta con sé il valore di questa convinzione.",
  },
  {
    label: "Cucina",
    text: "Siciliana nelle radici, stagionale per convinzione. Il nostro chef attinge direttamente dall'orto della tenuta e da una cerchia ristretta di agricoltori di cui ci fidiamo da decenni. Nulla arriva in tavola senza una storia da raccontare.",
  },
  {
    label: "Ospitalità",
    text: "La dimora apparteneva un tempo a un notaio che apriva la sua tavola a tutta la valle. Noi manteniamo viva quella tradizione. Che veniate in due o in duecento, il calore del benvenuto sarà sempre lo stesso.",
  },
];

export function RestaurantStory() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section id="story" className="bg-[#F7F7F4] py-16 overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-8">
        
        {/* Pulsante per aprire/chiudere */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex justify-between items-center bg-transparent border-none pb-6 text-left cursor-pointer transition-all duration-300 ${
            isOpen ? "border-b-0" : "border-b border-[#3F5D63]/15"
          }`}
        >
          <h2 className="font-serif text-3xl md:text-5xl text-[#1C2B2D] m-0">
            La nostra storia
          </h2>

          {/* Testo Grigio + Icona + */}
          <div className="flex items-center gap-3">
            <span className="font-sans text-xs md:text-sm tracking-wider font-medium text-gray-500">
  {isOpen ? "Riduci" : "Scopri di più"}
</span>
            <span
              className={`text-3xl text-[#3F5D63] font-light leading-none transition-transform duration-300 ${
                isOpen ? "rotate-45" : "rotate-0"
              }`}
            >
              +
            </span>
          </div>
        </button>

        {/* Contenitore a tendina  */}
        <div
          className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${
            isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="pt-16">
              
              {/* Top: editorial split layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center mb-28">
                {/* Left: text */}
                <div>
                  <h3 className="text-[#1C2B2D] text-2xl md:text-3xl mb-7 font-serif">
                    Una casa, un tavolo, una tradizione
                  </h3>
                  <p className="font-sans text-[1.0625rem] leading-relaxed text-[#4A5558] mb-8">
                    Il Casale del Notaio nasce da una domanda semplice: cosa accadrebbe se i migliori ingredienti della Sicilia potessero essere celebrati in un luogo degno del loro valore? Immerso nel verde tra antiche mura e ortaggi, il nostro locale accoglie gli ospiti dal 2008 con discrezione, dedizione e una cura che dura nel tempo.
                  </p>
                  <p className="font-serif italic text-xl leading-relaxed text-[#3F5D63] border-l-2 border-[#8B6B4A] pl-6">
                    "Il Casale del Notaio, del gusto il Teatro."
                  </p>
                </div>

                {/* Right: portrait image */}
                <div className="relative">
                  <div className="w-full aspect-[3/4] bg-[#D5D5B7] rounded-sm overflow-hidden relative">
                    <img
                      src="./images/story.webp"
                      alt="Elegant dining tables set in a cozy restaurant interior"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* Offset decorative block */}
                  <div className="absolute -bottom-8 -right-8 w-3/5 aspect-[4/3] bg-[#D5D5B7] rounded-sm overflow-hidden -z-10">
                    <img
                      src="https://images.unsplash.com/photo-1776848517525-ccc3a43bfcfb?w=500&h=375&fit=crop&auto=format"
                      alt="A table set with wine glasses for a fine dinner"
                      className="w-full h-full object-cover opacity-70"
                    />
                  </div>
                </div>
              </div>

              {/* Bottom: three pillars */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-[#3F5D63]/15 pt-16">
                {STORY_PILLARS.map((pillar, i) => (
                  <div key={pillar.label}>
                    <span className="font-sans text-[0.6875rem] tracking-[0.22em] uppercase text-[#8B6B4A] block mb-2">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h4 className="font-serif text-xl font-medium text-[#1C2B2D] mb-4 mt-0">
                      {pillar.label}
                    </h4>
                    <p className="font-sans text-sm leading-relaxed text-[#5A6668] m-0">
                      {pillar.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Wide landscape image */}
              <div className="mt-20 rounded-sm overflow-hidden h-[380px] bg-[#D5D5B7]">
                <img
                  src="/images/casale.webp"
                  alt="Historic Italian villa surrounded by olive groves"
                  className="w-full h-full object-cover object-[center_60%]"
                />
              </div>

            </div>
          </div>
        </div>

      </div>
    </section>
  );
}